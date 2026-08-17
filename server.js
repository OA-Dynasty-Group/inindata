const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('xlsx');

// Import storage layer (supports PostgreSQL or file-based storage)
const storage = require('./db/storage');
const ADMIN_PERMISSIONS = storage.ADMIN_PERMS_ARRAY;
const ROLE_PERMISSIONS = storage.ROLE_PERMISSIONS;
const passwordHash = storage.passwordHash;
const passwordsMatch = storage.passwordsMatch;

// Import email service (optional, requires configuration)
const email = require('./email/service');

// Import pagination utilities
const pagination = require('./api/pagination');

// Import caching utilities
const cache = require('./api/cache');

// Import compression
const zlib = require('node:zlib');

const ROOT = __dirname;

const TYPES = new Set(['shortText', 'longText', 'number', 'singleSelect', 'multiSelect', 'yesNo', 'date', 'rating']);
const sessions = new Map();


// Use storage layer functions
function initialData() { return storage.initialData(); }
function load() { return storage.load(); }
function write(data) { return storage.write(data); }
function audit(data, action, resourceType, resourceId, metadata = {}) { data.auditLogs.unshift({ id: crypto.randomUUID(), action, resourceType, resourceId, actor: 'local-admin', timestamp: new Date().toISOString(), metadata }); }
function instrument(data, id) { return data.instruments.find(item => item.id === id); }
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function cookie(req, name) { return (req.headers.cookie || '').split(';').map(v => v.trim().split('=')).find(([key]) => key === name)?.[1]; }
function currentUser(req, data) { const id = sessions.get(cookie(req, 'fieldwork_session')); return data.users?.find(user => user.id === id && user.status === 'active'); }
function authorized(req, data, permission) { const user = currentUser(req, data); return user && user.permissions.includes(permission) ? user : null; }
function unauthorized(res) { return json(res, 401, { error: 'Sign in is required to access this resource.' }); }
function publicUser(user) { const { password, ...safe } = user; return safe; }
function rolePermissions(role) { return ROLE_PERMISSIONS[role] || []; }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 8_000_000) reject(new Error('Request too large')); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON body')); } }); }); }
function safeInstrument(item) { const { versions, ...current } = item; return current; }
function validateDefinition(input) {
  const errors = []; if (!input || typeof input.name !== 'string' || !input.name.trim()) errors.push('A form name is required.');
  const questions = (input.sections || []).flatMap(section => section.questions || []); const keys = new Set(); questions.forEach((q, i) => { if (!q.id || !q.label?.trim()) errors.push(`Question ${i + 1} needs a label.`); if (!TYPES.has(q.type)) errors.push(`Question ${i + 1} has an unsupported type.`); if (!q.key || !/^[a-z][a-z0-9_]*$/.test(q.key)) errors.push(`Question ${i + 1} needs a valid internal key.`); if (keys.has(q.key)) errors.push(`Internal key “${q.key}” is used more than once.`); keys.add(q.key); if (['singleSelect', 'multiSelect'].includes(q.type) && (!Array.isArray(q.options) || q.options.length < 2)) errors.push(`Question ${i + 1} needs at least two choices.`); }); (input.sections || []).forEach((section, s) => { if (!section.title?.trim()) errors.push(`Section ${s + 1} needs a title.`); }); questions.forEach((q, i) => { if (q.visibleWhen && (!keys.has(q.visibleWhen.fieldKey) || q.visibleWhen.fieldKey === q.key || !String(q.visibleWhen.value ?? '').trim())) errors.push(`Question ${i + 1} has an invalid visibility rule.`); }); return errors;
}
function isVisible(question, answers) { if (!question.visibleWhen) return true; const actual = answers[question.visibleWhen.fieldKey]; const values = Array.isArray(actual) ? actual : [actual]; return values.map(value => String(value)).includes(String(question.visibleWhen.value)); }
function validateSubmission(version, answers) { const errors = {}; version.sections.flatMap(s => s.questions).forEach(q => { if (!isVisible(q, answers)) return; const value = answers[q.key]; const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length); if (q.required && empty) errors[q.key] = 'This question is required.'; if (empty) return; if (q.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) errors[q.key] = 'Enter a valid number.'; if (q.type === 'yesNo' && typeof value !== 'boolean') errors[q.key] = 'Select Yes or No.'; if (['singleSelect', 'multiSelect'].includes(q.type)) { const values = Array.isArray(value) ? value : [value]; if (values.some(v => !q.options.includes(v))) errors[q.key] = 'Choose a listed option.'; } }); return errors;
}
function datasetFor(data, item) { const version = item.versions.at(-1); const sections = version?.sections || item.sections; const columns = sections.flatMap(section => section.questions).map(question => ({ key: question.key, label: question.label, type: question.type })); const records = data.submissions.filter(submission => submission.instrumentId === item.id).map(({ id, status, submittedAt, instrumentVersion, answers }) => ({ id, status, submittedAt, instrumentVersion, answers })); return { id: `dataset-${item.id}`, name: `${item.name} responses`, source: 'instrument', classification: 'Internal', columns, records }; }
function csvValue(value) { const text = Array.isArray(value) ? value.join('; ') : value === undefined || value === null ? '' : String(value); return `"${text.replaceAll('"', '""')}"`; }
function aggregateDataset(dataset, dimension) { const field = dataset.columns.find(column => column.key === dimension); if (!field) throw new Error('Choose a valid dataset field to group by.'); const counts = new Map(); dataset.records.forEach(record => { const values = Array.isArray(record.answers[dimension]) ? record.answers[dimension] : [record.answers[dimension]]; values.filter(value => value !== undefined && value !== null && value !== '').forEach(value => counts.set(String(value), (counts.get(String(value)) || 0) + 1)); }); return { measure: 'Response count', dimension: field, total: dataset.records.length, groups: [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }; }
function parseCsv(text) { const rows = []; let row = []; let value = ''; let quoted = false; for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; } else if (char === ',' && !quoted) { row.push(value.trim()); value = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(value.trim()); if (row.some(cell => cell)) rows.push(row); row = []; value = ''; } else value += char; } if (quoted) throw new Error('The CSV contains an unclosed quoted value.'); row.push(value.trim()); if (row.some(cell => cell)) rows.push(row); if (rows.length < 2) throw new Error('The CSV needs a header row and at least one data row.'); return rows; }
function importRowsPreview(item, rows) { const version = item.versions.at(-1) || { sections: item.sections }; const fields = version.sections.flatMap(section => section.questions); const headers = rows[0].map(value => String(value)); const mapping = headers.map(header => { const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, ''); const field = fields.find(question => question.key.toLowerCase() === header.toLowerCase() || question.label.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized); return { column: header, key: field?.key || null, label: field?.label || null }; }); const problems = []; const records = rows.slice(1).map((row, index) => { const answers = {}; mapping.forEach((entry, column) => { if (!entry.key || row[column] === undefined || row[column] === '') return; const field = fields.find(question => question.key === entry.key); let value = String(row[column]); if (field.type === 'number') value = Number(value); if (field.type === 'yesNo') value = /^(yes|true)$/i.test(value) ? true : /^(no|false)$/i.test(value) ? false : value; if (field.type === 'multiSelect') value = value.split(';').map(part => part.trim()).filter(Boolean); answers[entry.key] = value; }); const errors = validateSubmission(version, answers); if (Object.keys(errors).length) problems.push({ row: index + 2, errors }); return answers; }); return { mapping, totalRows: records.length, validRows: records.length - problems.length, problems, records }; }
function importPreview(item, csv) { return importRowsPreview(item, parseCsv(csv)); }
function workbookPreview(item, base64, selectedSheet) { if (typeof base64 !== 'string' || base64.length > 7_000_000) throw new Error('Upload an XLSX file smaller than 5 MB.'); const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer', cellDates: false }); const sheetName = selectedSheet || workbook.SheetNames[0]; if (!workbook.Sheets[sheetName]) throw new Error('Choose a sheet from the uploaded workbook.'); const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false }); if (rows.length < 2) throw new Error('The selected sheet needs a header row and at least one data row.'); return { ...importRowsPreview(item, rows), sheets: workbook.SheetNames, selectedSheet: sheetName }; }
function getImportPreview(item, body) { if (body.csv !== undefined) { if (typeof body.csv !== 'string' || body.csv.length > 5_000_000) throw new Error('Upload a CSV file smaller than 5 MB.'); return importPreview(item, body.csv); } if (body.workbook !== undefined) return workbookPreview(item, body.workbook, body.sheet); throw new Error('Upload a CSV or XLSX file.'); }
function canReviewTransition(from, to) { return ({ submitted: ['approved', 'rejected'], approved: ['locked'] }[from] || []).includes(to); }
function staticFile(res, pathname) { const requested = pathname === '/' ? 'index.html' : pathname.slice(1); const file = path.resolve(ROOT, requested); const outsideRoot = path.relative(ROOT, file).startsWith('..'); if (outsideRoot || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'Not found' }); const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)] || 'application/octet-stream'; res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); fs.createReadStream(file).pipe(res); }

// Phase 3.2: Performance optimizations
function shouldCompress(size) { return size > 1024; } // Compress if > 1KB

function jsonCompressed(res, code, body) {
  const json = JSON.stringify(body);
  const encoding = (res.req?.headers['accept-encoding'] || '').includes('gzip') ? 'gzip' : null;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': code === 200 ? 'public, max-age=60' : 'no-store'
  };
  
  if (encoding && shouldCompress(json.length)) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(code, headers);
    zlib.gzip(json, (err, compressed) => {
      res.end(err ? json : compressed);
    });
  } else {
    res.writeHead(code, headers);
    res.end(json);
  }
}

function jsonCached(res, code, body, cacheKey, ttl = cache.TTL.ANALYTICS) {
  const eTag = cache.getETag(body);
  const clientETag = res.req?.headers['if-none-match'];
  
  if (clientETag && cache.etagMatches(clientETag, eTag)) {
    res.writeHead(304, { 'ETag': eTag, 'Cache-Control': 'public, max-age=60' });
    return res.end();
  }
  
  const json = JSON.stringify(body);
  const encoding = (res.req?.headers['accept-encoding'] || '').includes('gzip') ? 'gzip' : null;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'ETag': eTag,
    'Cache-Control': 'public, max-age=60'
  };
  
  if (encoding && shouldCompress(json.length)) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(code, headers);
    zlib.gzip(json, (err, compressed) => {
      res.end(err ? json : compressed);
    });
  } else {
    res.writeHead(code, headers);
    res.end(json);
  }
}

const handler = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`); const segments = url.pathname.split('/').filter(Boolean); const data = load();
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && url.pathname === '/api/health/db') {
      if (!storage.USE_DATABASE) {
        return json(res, 200, { status: 'ok', database: 'file-based' });
      }
      try {
        const db = storage.getDb();
        if (!db) return json(res, 503, { status: 'unavailable', error: 'Database not initialized' });
        const health = await db.health();
        return json(res, health.ok ? 200 : 503, health);
      } catch (error) {
        return json(res, 503, { status: 'error', error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/health/email') {
      const health = await email.health();
      return json(res, health.status === 'ok' ? 200 : health.status === 'disabled' ? 200 : 503, health);
    }
    if (req.method === 'POST' && url.pathname === '/api/email/test') {
      if (!authorized(req, data, 'user:write')) return unauthorized(res);
      const user = currentUser(req, data);
      const result = await email.sendEmail(
        user.email,
        'Test Email from Fieldwork',
        'This is a test email to verify your email configuration is working correctly.',
        '<h2>Test Email</h2><p>This is a test email to verify your email configuration is working correctly.</p>'
      );
      return json(res, result.status === 'sent' ? 200 : 503, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') { const body = await readBody(req); const user = data.users?.find(item => item.email.toLowerCase() === String(body.email || '').toLowerCase() && item.status === 'active'); if (!user || !passwordsMatch(String(body.password || ''), user)) return json(res, 401, { error: 'The email or password is incorrect.' }); const token = crypto.randomBytes(32).toString('base64url'); sessions.set(token, user.id); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `fieldwork_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`, 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ user: publicUser(user) })); }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') { const token = cookie(req, 'fieldwork_session'); if (token) sessions.delete(token); res.writeHead(204, { 'Set-Cookie': 'fieldwork_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/api/me') { const user = currentUser(req, data); return user ? json(res, 200, { user: publicUser(user) }) : unauthorized(res); }
    if (req.method === 'POST' && url.pathname === '/api/auth/password-reset') { const body = await readBody(req); const userEmail = String(body.email || '').trim().toLowerCase(); if (!userEmail || !/^\S+@\S+\.\S+$/.test(userEmail)) return json(res, 422, { error: 'Provide a valid email address.' }); const user = data.users?.find(u => u.email === userEmail); if (!user) return json(res, 404, { error: 'No account found with this email address.' }); const resetToken = crypto.randomBytes(32).toString('base64url'); const resetTokenExpiry = Date.now() + 3600000; user.passwordResetToken = resetToken; user.passwordResetExpiry = resetTokenExpiry; audit(data, 'PASSWORD_RESET_REQUEST', 'user', user.id, { email: user.email }); write(data); const resetUrl = `${process.env.FIELDWORK_PUBLIC_URL || 'http://localhost:3000'}/reset-password/${resetToken}`; if (email.ENABLED) { email.sendEmail(user.email, email.templates.passwordReset(user.name, resetUrl).subject, email.templates.passwordReset(user.name, resetUrl).text, email.templates.passwordReset(user.name, resetUrl).html).catch(err => console.error('[Email] Failed to send password reset:', err.message)); } return json(res, 200, { message: 'Password reset instructions have been sent to your email.' }); }
    if (req.method === 'POST' && url.pathname === '/api/auth/password-reset/confirm') { const body = await readBody(req); const token = String(body.token || '').trim(); const newPassword = String(body.password || '').trim(); if (newPassword.length < 12) return json(res, 422, { error: 'Password must be at least 12 characters.' }); const user = data.users?.find(u => u.passwordResetToken === token && u.passwordResetExpiry > Date.now()); if (!user) return json(res, 401, { error: 'Reset link is invalid or has expired.' }); user.password = passwordHash(newPassword); delete user.passwordResetToken; delete user.passwordResetExpiry; audit(data, 'PASSWORD_RESET_COMPLETE', 'user', user.id, {}); write(data); return json(res, 200, { message: 'Password has been reset successfully.' }); }
    if (req.method === 'GET' && url.pathname === '/api/organization') { const user = currentUser(req, data); if (!user) return unauthorized(res); return json(res, 200, data.organization); }
    if (req.method === 'PATCH' && url.pathname === '/api/organization') { if (!authorized(req, data, 'user:write')) return unauthorized(res); const body = await readBody(req); if (body.name?.trim()) { data.organization.name = body.name.trim(); audit(data, 'UPDATE', 'organization', data.organization.id, { name: data.organization.name }); write(data); } return json(res, 200, data.organization); }
    if (req.method === 'GET' && url.pathname === '/api/users') { if (!authorized(req, data, 'user:read')) return unauthorized(res); const params = pagination.parsePaginationParams(req.url); const result = pagination.applyQuery(data.users.map(publicUser), { filters: params.filter, search: params.search, searchFields: ['name', 'email'], sort: params.sort, page: params.page, limit: params.limit }); return json(res, 200, pagination.formatResponse(result)); }
    if (req.method === 'POST' && url.pathname === '/api/users') { if (!authorized(req, data, 'user:write')) return unauthorized(res); const body = await readBody(req); const email = String(body.email || '').trim().toLowerCase(); const role = String(body.role || 'field_worker'); if (!body.name?.trim() || !/^\S+@\S+\.\S+$/.test(email) || String(body.password || '').length < 12 || !ROLE_PERMISSIONS[role]) return json(res, 422, { error: 'Provide a name, valid email, a password of at least 12 characters, and a valid role.' }); if (data.users.some(user => user.email === email)) return json(res, 409, { error: 'A user with this email already exists.' }); const user = { id: crypto.randomUUID(), name: body.name.trim(), email, status: 'active', roles: [role], permissions: rolePermissions(role), password: passwordHash(body.password) }; data.users.push(user); audit(data, 'CREATE', 'user', user.id, { email: user.email, role }); write(data); if (email.ENABLED) { email.sendEmail(user.email, 'Welcome to ' + data.organization.name, `Welcome ${user.name}! You have been added to ${data.organization.name}. Your initial password has been set.`, `<h2>Welcome to ${data.organization.name}</h2><p>Hello ${user.name},</p><p>You have been added to <strong>${data.organization.name}</strong>.</p><p>You can now sign in with:</p><ul><li><strong>Email:</strong> ${user.email}</li><li><strong>Password:</strong> The one provided to you</li></ul><p><a href="${process.env.FIELDWORK_PUBLIC_URL || 'http://localhost:3000'}" style="display:inline-block;padding:12px 20px;background:#0066cc;color:white;text-decoration:none;border-radius:4px;">Sign in to ${data.organization.name}</a></p>`).catch(err => console.error('[Email] Failed to send welcome email:', err.message)); } return json(res, 201, publicUser(user)); }
    if (req.method === 'PATCH' && segments[0] === 'api' && segments[1] === 'users' && segments[2] && segments[3] === 'status') { if (!authorized(req, data, 'user:write')) return unauthorized(res); const user = data.users.find(item => item.id === segments[2]); const body = await readBody(req); if (!user) return json(res, 404, { error: 'User not found.' }); if (!['active', 'suspended', 'deactivated'].includes(body.status)) return json(res, 422, { error: 'Use active, suspended, or deactivated.' }); if (user.id === currentUser(req, data).id && body.status !== 'active') return json(res, 422, { error: 'You cannot disable your own account.' }); user.status = body.status; audit(data, 'UPDATE', 'user', user.id, { status: user.status }); write(data); return json(res, 200, publicUser(user)); }
    if (req.method === 'GET' && url.pathname === '/api/programs') { if (!authorized(req, data, 'program:read')) return unauthorized(res); const params = pagination.parsePaginationParams(req.url); const result = pagination.applyQuery(data.programs, { filters: params.filter, search: params.search, searchFields: ['name', 'code', 'description'], sort: params.sort, page: params.page, limit: params.limit }); return json(res, 200, pagination.formatResponse(result)); }
    if (req.method === 'POST' && url.pathname === '/api/programs') { if (!authorized(req, data, 'program:write')) return unauthorized(res); const body = await readBody(req); if (!body.name?.trim()) return json(res, 422, { error: 'A program name is required.' }); const program = { id: crypto.randomUUID(), name: body.name.trim(), code: String(body.code || '').trim(), description: String(body.description || '').trim(), status: 'planned', projects: [] }; data.programs.push(program); audit(data, 'CREATE', 'program', program.id, { name: program.name }); write(data); return json(res, 201, program); }
    if (req.method === 'POST' && segments[0] === 'api' && segments[1] === 'programs' && segments[2] && segments[3] === 'projects') { if (!authorized(req, data, 'program:write')) return unauthorized(res); const program = data.programs.find(item => item.id === segments[2]); if (!program) return json(res, 404, { error: 'Program not found.' }); const body = await readBody(req); if (!body.name?.trim()) return json(res, 422, { error: 'A project name is required.' }); const project = { id: crypto.randomUUID(), name: body.name.trim(), status: 'planned' }; program.projects.push(project); audit(data, 'CREATE', 'project', project.id, { programId: program.id, name: project.name }); write(data); return json(res, 201, project); }
    if (req.method === 'GET' && url.pathname === '/api/reports') { if (!authorized(req, data, 'report:read')) return unauthorized(res); const params = pagination.parsePaginationParams(req.url); const result = pagination.applyQuery(data.reports, { filters: params.filter, search: params.search, searchFields: ['title', 'narrative'], sort: params.sort, page: params.page, limit: params.limit }); return json(res, 200, pagination.formatResponse(result)); }
    if (req.method === 'POST' && url.pathname === '/api/reports') { if (!authorized(req, data, 'report:write')) return unauthorized(res); const body = await readBody(req); const item = instrument(data, body.instrumentId); if (!body.title?.trim() || !item) return json(res, 422, { error: 'A report title and valid instrument are required.' }); const dataset = datasetFor(data, item); try { aggregateDataset(dataset, body.dimension); } catch (error) { return json(res, 422, { error: error.message }); } const report = { id: crypto.randomUUID(), title: body.title.trim(), instrumentId: item.id, dimension: body.dimension, narrative: String(body.narrative || '').trim(), createdAt: new Date().toISOString(), createdBy: currentUser(req, data).id }; data.reports.unshift(report); audit(data, 'CREATE', 'report', report.id, { title: report.title, instrumentId: item.id }); write(data); return json(res, 201, report); }
    if (req.method === 'GET' && url.pathname === '/api/dashboards') { if (!authorized(req, data, 'dashboard:read')) return unauthorized(res); const params = pagination.parsePaginationParams(req.url); const result = pagination.applyQuery(data.dashboards, { filters: params.filter, search: params.search, searchFields: ['name'], sort: params.sort, page: params.page, limit: params.limit }); return json(res, 200, pagination.formatResponse(result)); }
    if (req.method === 'POST' && url.pathname === '/api/dashboards') { if (!authorized(req, data, 'dashboard:write')) return unauthorized(res); const body = await readBody(req); const item = instrument(data, body.instrumentId); if (!body.name?.trim() || !item) return json(res, 422, { error: 'A dashboard name and valid instrument are required.' }); const dataset = datasetFor(data, item); try { aggregateDataset(dataset, body.dimension); } catch (error) { return json(res, 422, { error: error.message }); } const dashboard = { id: crypto.randomUUID(), name: body.name.trim(), widgets: [{ type: 'bar', instrumentId: item.id, dimension: body.dimension, measure: 'response_count' }], createdAt: new Date().toISOString(), createdBy: currentUser(req, data).id }; data.dashboards.unshift(dashboard); audit(data, 'CREATE', 'dashboard', dashboard.id, { name: dashboard.name, instrumentId: item.id }); write(data); return json(res, 201, dashboard); }
    if (req.method === 'GET' && url.pathname === '/api/instruments') { 
      if (!authorized(req, data, 'instrument:read')) return unauthorized(res); 
      
      // Check if using cursor-based pagination
      const params = new URL(req.url, 'http://localhost').searchParams;
      const useCursor = params.has('cursor');
      
      if (useCursor) {
        // Cursor-based pagination (no caching for cursors)
        const cursorParams = pagination.parseCursorParams(req.url);
        const result = pagination.applyQueryWithCursor(data.instruments.map(safeInstrument), {
          filters: cursorParams.filter,
          search: cursorParams.search,
          searchFields: ['name'],
          sort: cursorParams.sort,
          cursor: cursorParams.cursor,
          limit: cursorParams.limit
        });
        return json(res, 200, pagination.formatCursorResponse(result));
      } else {
        // Offset-based pagination with caching
        const cacheKey = cache.getCacheKey('instruments-list');
        let cached = cache.instrumentCache.get(cacheKey);
        if (!cached) {
          const offsetParams = pagination.parsePaginationParams(req.url);
          cached = pagination.formatResponse(pagination.applyQuery(data.instruments.map(safeInstrument), { filters: offsetParams.filter, search: offsetParams.search, searchFields: ['name'], sort: offsetParams.sort, page: offsetParams.page, limit: offsetParams.limit }));
          cache.instrumentCache.set(cacheKey, cached, cache.TTL.INSTRUMENTS);
        }
        return jsonCached(res, 200, cached, cacheKey, cache.TTL.INSTRUMENTS);
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/instruments') { if (!authorized(req, data, 'instrument:write')) return unauthorized(res); const body = await readBody(req); if (!body.name?.trim()) return json(res, 422, { error: 'An instrument name is required.' }); if (body.programId && !data.programs.find(program => program.id === body.programId)) return json(res, 422, { error: 'Choose a valid program.' }); const item = { id: crypto.randomUUID(), name: body.name.trim(), programId: body.programId || data.programs[0]?.id || null, status: 'draft', version: 0, collectionToken: null, updatedAt: new Date().toISOString(), sections: [{ id: crypto.randomUUID(), title: 'Section 1', description: '', questions: [] }], versions: [] }; data.instruments.push(item); audit(data, 'CREATE', 'instrument', item.id, { name: item.name, programId: item.programId }); write(data); cache.invalidateInstrumentCache(); cache.invalidateAnalyticsCache(); return json(res, 201, safeInstrument(item)); }
    if (segments[0] === 'api' && segments[1] === 'instruments' && segments[2]) {
      const item = instrument(data, segments[2]); if (!item) return json(res, 404, { error: 'Instrument not found.' });
      if (req.method === 'GET' && segments.length === 3) { if (!authorized(req, data, 'instrument:read')) return unauthorized(res); return json(res, 200, safeInstrument(item)); }
      if (req.method === 'PUT' && segments.length === 3) { if (!authorized(req, data, 'instrument:write')) return unauthorized(res); if (item.status === 'published') return json(res, 409, { error: 'Published instruments are immutable. Create a new draft version.' }); const body = await readBody(req); const errors = validateDefinition(body); if (errors.length) return json(res, 422, { errors }); item.name = body.name.trim(); item.sections = body.sections; item.updatedAt = new Date().toISOString(); audit(data, 'UPDATE', 'instrument', item.id, { change: 'draft definition' }); write(data); cache.invalidateInstrumentCache(item.id); cache.invalidateAnalyticsCache(item.id); return json(res, 200, safeInstrument(item)); }
      if (req.method === 'POST' && segments[3] === 'publish') { if (!authorized(req, data, 'instrument:publish')) return unauthorized(res); const errors = validateDefinition(item); if (errors.length) return json(res, 422, { errors }); const published = { id: crypto.randomUUID(), version: item.version + 1, publishedAt: new Date().toISOString(), sections: structuredClone(item.sections) }; item.versions.push(published); item.version = published.version; item.status = 'published'; item.collectionToken ||= crypto.randomBytes(18).toString('base64url'); item.updatedAt = published.publishedAt; audit(data, 'PUBLISH', 'instrument', item.id, { version: item.version }); write(data); cache.invalidateInstrumentCache(item.id); cache.invalidateAnalyticsCache(item.id); return json(res, 201, { instrument: safeInstrument(item), collectionUrl: `/collect/${item.collectionToken}` }); }
      if (req.method === 'GET' && segments[3] === 'submissions') { if (!authorized(req, data, 'instrument:read')) return unauthorized(res); const params = pagination.parsePaginationParams(req.url); const submissions = data.submissions.filter(s => s.instrumentId === item.id).map(({ answers, ...submission }) => ({ ...submission, answerCount: Object.keys(answers).length })); const result = pagination.applyQuery(submissions, { filters: params.filter, search: params.search, searchFields: ['id', 'status'], sort: params.sort, page: params.page, limit: params.limit }); return json(res, 200, pagination.formatResponse(result)); }
      if (req.method === 'GET' && segments[3] === 'dataset') { if (!authorized(req, data, 'instrument:read')) return unauthorized(res); const dataset = datasetFor(data, item); if (segments[4] === 'export') { const user = authorized(req, data, 'dataset:export'); if (!user) return unauthorized(res); const headers = ['Response ID', 'Status', 'Submitted at', 'Instrument version', ...dataset.columns.map(column => column.label)]; const lines = [headers.map(csvValue).join(','), ...dataset.records.map(record => [record.id, record.status, record.submittedAt, record.instrumentVersion, ...dataset.columns.map(column => record.answers[column.key])].map(csvValue).join(','))]; audit(data, 'EXPORT', 'dataset', dataset.id, { format: 'csv', recordCount: dataset.records.length, userId: user.id }); write(data); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-responses.csv"`, 'Cache-Control': 'no-store' }); return res.end(lines.join('\n')); } return json(res, 200, dataset); }
      if (req.method === 'GET' && segments[3] === 'analytics') { if (!authorized(req, data, 'analytics:read')) return unauthorized(res); const dataset = datasetFor(data, item); const dimension = url.searchParams.get('dimension') || dataset.columns[0]?.key; if (!dimension) return json(res, 422, { error: 'This dataset has no fields to analyze.' }); const dateRange = url.searchParams.get('dateRange'); let fromDate = null, toDate = new Date(); if (dateRange && dateRange !== 'all') { const days = parseInt(dateRange); if (days > 0) { fromDate = new Date(toDate.getTime() - days * 86400000); } } const filteredDataset = fromDate ? { ...dataset, records: dataset.records.filter(record => new Date(record.submittedAt) >= fromDate) } : dataset; return json(res, 200, aggregateDataset(filteredDataset, dimension)); }
      if (req.method === 'POST' && segments[3] === 'dataset' && segments[4] === 'import' && segments[5] === 'preview') { if (!authorized(req, data, 'dataset:import')) return unauthorized(res); const body = await readBody(req); try { return json(res, 200, getImportPreview(item, body)); } catch (error) { return json(res, 422, { error: error.message }); } }
      if (req.method === 'POST' && segments[3] === 'dataset' && segments[4] === 'import') { if (!authorized(req, data, 'dataset:import')) return unauthorized(res); const body = await readBody(req); let preview; try { preview = getImportPreview(item, body); } catch (error) { return json(res, 422, { error: error.message }); } if (preview.problems.length) return json(res, 422, { error: 'Fix the import validation issues before importing.', problems: preview.problems }); const importedAt = new Date().toISOString(); const version = item.versions.at(-1)?.version || 0; preview.records.forEach(answers => data.submissions.push({ id: crypto.randomUUID(), instrumentId: item.id, instrumentVersion: version, status: 'submitted', source: 'import', answers, submittedAt: importedAt })); audit(data, 'IMPORT', 'dataset', `dataset-${item.id}`, { format: body.workbook ? 'xlsx' : 'csv', recordCount: preview.records.length }); write(data); return json(res, 201, { imported: preview.records.length }); }
    }
    if (req.method === 'GET' && segments[0] === 'api' && segments[1] === 'collect' && segments[2]) { const item = data.instruments.find(x => x.collectionToken === segments[2] && x.status === 'published'); if (!item) return json(res, 404, { error: 'This collection link is unavailable.' }); const version = item.versions.at(-1); return json(res, 200, { instrumentId: item.id, name: item.name, version: version.version, sections: version.sections }); }
    if (req.method === 'POST' && segments[0] === 'api' && segments[1] === 'collect' && segments[2] && segments[3] === 'submissions') { 
      const item = data.instruments.find(x => x.collectionToken === segments[2] && x.status === 'published'); 
      if (!item) return json(res, 404, { error: 'This collection link is unavailable.' }); 
      const body = await readBody(req); 
      const version = item.versions.at(-1); 
      const errors = validateSubmission(version, body.answers || {}); 
      if (Object.keys(errors).length) return json(res, 422, { error: 'Please correct the highlighted answers.', fields: errors }); 
      const submission = { id: crypto.randomUUID(), instrumentId: item.id, instrumentVersion: version.version, status: 'submitted', answers: body.answers, submittedAt: new Date().toISOString() }; 
      data.submissions.push(submission); 
      audit(data, 'CREATE', 'submission', submission.id, { instrumentId: item.id, version: version.version }); 
      write(data); 
      cache.invalidateAnalyticsCache(item.id);
      
      // Send confirmation email if email is enabled and respondent email was provided
      if (email.ENABLED && body.respondentEmail) {
        email.sendEmail(
          body.respondentEmail,
          `Thank you for your response to "${item.name}"`,
          `Your response has been received (ID: ${submission.id}). Thank you for your participation.`,
          `<h2>Thank you for your response</h2><p>Your response to <strong>"${item.name}"</strong> has been received.</p><p><strong>Submission ID:</strong> ${submission.id}</p>`
        ).catch(err => console.error('[Email] Failed to send submission confirmation:', err.message));
      }
      
      return json(res, 201, { id: submission.id, status: submission.status }); 
    }
    if (req.method === 'POST' && segments[0] === 'api' && segments[1] === 'submissions' && segments[2] && segments[3] === 'review') { 
      if (!authorized(req, data, 'submission:review')) return unauthorized(res); 
      const submission = data.submissions.find(s => s.id === segments[2]); 
      if (!submission) return json(res, 404, { error: 'Submission not found.' }); 
      const body = await readBody(req); 
      if (!['approved', 'rejected', 'locked'].includes(body.status)) return json(res, 422, { error: 'Use approved, rejected, or locked as the review status.' }); 
      if (!canReviewTransition(submission.status, body.status)) return json(res, 409, { error: `A ${submission.status} response cannot move to ${body.status}.` }); 
      submission.status = body.status; 
      submission.reviewedAt = new Date().toISOString(); 
      submission.reviewedBy = currentUser(req, data).id; 
      audit(data, body.status.toUpperCase(), 'submission', submission.id, { instrumentId: submission.instrumentId }); 
      write(data); 
      
      // Send review notification email if configured
      if (email.ENABLED && body.notificationEmail) {
        const instrument = data.instruments.find(i => i.id === submission.instrumentId);
        email.sendEmail(
          body.notificationEmail,
          `Your submission to "${instrument?.name}" has been ${body.status}`,
          `Your submission (ID: ${submission.id}) has been reviewed and marked as ${body.status}. ${body.notes ? `Notes: ${body.notes}` : ''}`,
          `<h2>Your submission has been reviewed</h2><p>Your submission to <strong>"${instrument?.name}"</strong> has been marked as <strong>${body.status}</strong>.</p><p><strong>Submission ID:</strong> ${submission.id}</p>${body.notes ? `<p><strong>Notes:</strong></p><p>${body.notes.split('\n').join('<br>')}</p>` : ''}`
        ).catch(err => console.error('[Email] Failed to send review notification:', err.message));
      }
      
      return json(res, 200, { id: submission.id, status: submission.status }); 
    }
    if (req.method === 'GET' && url.pathname === '/api/audit-logs') { if (!authorized(req, data, 'audit:read')) return unauthorized(res); const params = pagination.parsePaginationParams(req.url); const result = pagination.applyQuery(data.auditLogs, { filters: params.filter, search: params.search, searchFields: ['action', 'resourceType'], sort: params.sort || '-timestamp', page: params.page, limit: params.limit }); return json(res, 200, pagination.formatResponse(result)); }
    
    // Phase 4: Advanced Permissions - Project Members
    if (req.method === 'GET' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'members') {
      if (!authorized(req, data, 'project:manage')) return unauthorized(res);
      const projectId = segments[2];
      const project = data.projects?.find(p => p.id === projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return json(res, 200, project.members || []);
    }
    
    if (req.method === 'POST' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'members') {
      if (!authorized(req, data, 'project:manage')) return unauthorized(res);
      const body = await readBody(req);
      const projectId = segments[2];
      const project = data.projects?.find(p => p.id === projectId);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (!body.userId || !body.roleId) return json(res, 422, { error: 'userId and roleId required' });
      
      const member = { id: crypto.randomUUID(), userId: body.userId, roleId: body.roleId, permissions: body.permissions || [], addedAt: new Date().toISOString() };
      if (!project.members) project.members = [];
      project.members.push(member);
      audit(data, 'ADD_PROJECT_MEMBER', 'project', projectId, { userId: body.userId, roleId: body.roleId });
      write(data);
      return json(res, 201, member);
    }
    
    // Phase 4: Advanced Permissions - Field Access
    if (req.method === 'GET' && segments[0] === 'api' && segments[1] === 'instruments' && segments[2] && segments[3] === 'field-access') {
      if (!authorized(req, data, 'instrument:read')) return unauthorized(res);
      const instrumentId = segments[2];
      const instrument = data.instruments?.find(i => i.id === instrumentId);
      if (!instrument) return json(res, 404, { error: 'Instrument not found' });
      return json(res, 200, instrument.fieldAccess || []);
    }
    
    if (req.method === 'POST' && segments[0] === 'api' && segments[1] === 'instruments' && segments[2] && segments[3] === 'field-access') {
      if (!authorized(req, data, 'instrument:write')) return unauthorized(res);
      const body = await readBody(req);
      const instrumentId = segments[2];
      const instrument = data.instruments?.find(i => i.id === instrumentId);
      if (!instrument) return json(res, 404, { error: 'Instrument not found' });
      
      const fieldAccess = {
        id: crypto.randomUUID(),
        fieldKey: body.fieldKey,
        classification: body.classification || 'public',
        roleId: body.roleId,
        userId: body.userId,
        canView: body.canView !== false,
        canExport: body.canExport === true,
        canEdit: body.canEdit === true,
        addedAt: new Date().toISOString()
      };
      
      if (!instrument.fieldAccess) instrument.fieldAccess = [];
      instrument.fieldAccess.push(fieldAccess);
      audit(data, 'SET_FIELD_ACCESS', 'instrument', instrumentId, { fieldKey: body.fieldKey });
      write(data);
      return json(res, 201, fieldAccess);
    }
    
    if (req.method === 'GET' && segments[0] === 'collect' && segments[1]) return staticFile(res, '/collect.html');
    return staticFile(res, url.pathname);
  } catch (error) { return json(res, error.message === 'Invalid JSON body' ? 400 : 500, { error: error.message || 'Unexpected server error.' }); }
};
module.exports = handler;
module.exports.default = handler;
module.exports.validateDefinition = validateDefinition;
module.exports.validateSubmission = validateSubmission;
module.exports.initialData = initialData;
module.exports.datasetFor = datasetFor;
module.exports.parseCsv = parseCsv;
module.exports.importPreview = importPreview;
module.exports.workbookPreview = workbookPreview;
module.exports.aggregateDataset = aggregateDataset;
module.exports.canReviewTransition = canReviewTransition;
module.exports.isVisible = isVisible;
module.exports.rolePermissions = rolePermissions;
if (require.main === module) {
  const httpServer = http.createServer(handler);
  const port = process.env.FIELDWORK_PORT || 3000;
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL;

  // Log startup environment
  console.log(`[Startup] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[Startup] Platform: ${isVercel ? 'Vercel' : 'Local/Self-hosted'}`);

  // Log which backend is active
  if (storage.USE_DATABASE) {
    console.log(`[Startup] Database: PostgreSQL (via ${process.env.DATABASE_URL_PGBOUNCER ? 'PgBouncer' : 'Direct connection'})`);
    if (process.env.SUPABASE_URL) {
      console.log(`[Startup] Provider: Supabase`);
    }
  } else {
    console.log('[Startup] Database: File-based storage (development mode)');
  }

  httpServer.listen(port, () => {
    console.log(`[Ready] Fieldwork listening on http://localhost:${port}`);
  });
}
