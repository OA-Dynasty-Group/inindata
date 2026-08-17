const crypto = require('node:crypto');
const zlib = require('node:zlib');
const XLSX = require('xlsx');
const { requireAuth, requirePermission } = require('../lib/auth');
const { json, readBody, unauthorized } = require('../lib/json');
const pagination = require('../api/pagination');
const cache = require('../api/cache');
const storage = require('../db/storage');
const email = require('../email/service');

const TYPES = new Set(['shortText', 'longText', 'number', 'singleSelect', 'multiSelect', 'yesNo', 'date', 'rating']);

function write(data) { storage.write(data); }

function audit(data, action, resourceType, resourceId, metadata = {}) {
  data.auditLogs.unshift({ id: crypto.randomUUID(), action, resourceType, resourceId, actor: 'local-admin', timestamp: new Date().toISOString(), metadata });
}

function instrument(data, id) {
  return data.instruments.find(item => item.id === id);
}

function safeInstrument(item) {
  const { versions, ...current } = item;
  return current;
}

function validateDefinition(input) {
  const errors = [];
  if (!input || typeof input.name !== 'string' || !input.name.trim()) errors.push('A form name is required.');
  const questions = (input.sections || []).flatMap(section => section.questions || []);
  const keys = new Set();
  questions.forEach((q, i) => {
    if (!q.id || !q.label?.trim()) errors.push(`Question ${i + 1} needs a label.`);
    if (!TYPES.has(q.type)) errors.push(`Question ${i + 1} has an unsupported type.`);
    if (!q.key || !/^[a-z][a-z0-9_]*$/.test(q.key)) errors.push(`Question ${i + 1} needs a valid internal key.`);
    if (keys.has(q.key)) errors.push(`Internal key "${q.key}" is used more than once.`);
    keys.add(q.key);
    if (['singleSelect', 'multiSelect'].includes(q.type) && (!Array.isArray(q.options) || q.options.length < 2)) errors.push(`Question ${i + 1} needs at least two choices.`);
  });
  (input.sections || []).forEach((section, s) => {
    if (!section.title?.trim()) errors.push(`Section ${s + 1} needs a title.`);
  });
  questions.forEach((q, i) => {
    if (q.visibleWhen && (!keys.has(q.visibleWhen.fieldKey) || q.visibleWhen.fieldKey === q.key || !String(q.visibleWhen.value ?? '').trim())) errors.push(`Question ${i + 1} has an invalid visibility rule.`);
  });
  return errors;
}

function isVisible(question, answers) {
  if (!question.visibleWhen) return true;
  const actual = answers[question.visibleWhen.fieldKey];
  const values = Array.isArray(actual) ? actual : [actual];
  return values.map(value => String(value)).includes(String(question.visibleWhen.value));
}

function validateSubmission(version, answers) {
  const errors = {};
  version.sections.flatMap(s => s.questions).forEach(q => {
    if (!isVisible(q, answers)) return;
    const value = answers[q.key];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
    if (q.required && empty) errors[q.key] = 'This question is required.';
    if (empty) return;
    if (q.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) errors[q.key] = 'Enter a valid number.';
    if (q.type === 'yesNo' && typeof value !== 'boolean') errors[q.key] = 'Select Yes or No.';
    if (['singleSelect', 'multiSelect'].includes(q.type)) {
      const values = Array.isArray(value) ? value : [value];
      if (values.some(v => !q.options.includes(v))) errors[q.key] = 'Choose a listed option.';
    }
  });
  return errors;
}

function datasetFor(data, item) {
  const version = item.versions.at(-1);
  const sections = version?.sections || item.sections;
  const columns = sections.flatMap(section => section.questions).map(question => ({ key: question.key, label: question.label, type: question.type }));
  const records = data.submissions.filter(submission => submission.instrumentId === item.id).map(({ id, status, submittedAt, instrumentVersion, answers }) => ({ id, status, submittedAt, instrumentVersion, answers }));
  return { id: `dataset-${item.id}`, name: `${item.name} responses`, source: 'instrument', classification: 'Internal', columns, records };
}

function csvValue(value) {
  const text = Array.isArray(value) ? value.join('; ') : value === undefined || value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function aggregateDataset(dataset, dimension) {
  const field = dataset.columns.find(column => column.key === dimension);
  if (!field) throw new Error('Choose a valid dataset field to group by.');
  const counts = new Map();
  dataset.records.forEach(record => {
    const values = Array.isArray(record.answers[dimension]) ? record.answers[dimension] : [record.answers[dimension]];
    values.filter(value => value !== undefined && value !== null && value !== '').forEach(value => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
  });
  return { measure: 'Response count', dimension: field, total: dataset.records.length, groups: [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value.trim());
      if (row.some(cell => cell)) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  row.push(value.trim());
  if (row.some(cell => cell)) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one data row.');
  return rows;
}

function importRowsPreview(item, rows) {
  const version = item.versions.at(-1) || { sections: item.sections };
  const fields = version.sections.flatMap(section => section.questions);
  const headers = rows[0].map(value => String(value));
  const mapping = headers.map(header => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    const field = fields.find(question => question.key.toLowerCase() === header.toLowerCase() || question.label.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
    return { column: header, key: field?.key || null, label: field?.label || null };
  });
  const problems = [];
  const records = rows.slice(1).map((row, index) => {
    const answers = {};
    mapping.forEach((entry, column) => {
      if (!entry.key || row[column] === undefined || row[column] === '') return;
      const field = fields.find(question => question.key === entry.key);
      let value = String(row[column]);
      if (field.type === 'number') value = Number(value);
      if (field.type === 'yesNo') value = /^(yes|true)$/i.test(value) ? true : /^(no|false)$/i.test(value) ? false : value;
      if (field.type === 'multiSelect') value = value.split(';').map(part => part.trim()).filter(Boolean);
      answers[entry.key] = value;
    });
    const errors = validateSubmission(version, answers);
    if (Object.keys(errors).length) problems.push({ row: index + 2, errors });
    return answers;
  });
  return { mapping, totalRows: records.length, validRows: records.length - problems.length, problems, records };
}

function importPreview(item, csv) {
  return importRowsPreview(item, parseCsv(csv));
}

function workbookPreview(item, base64, selectedSheet) {
  if (typeof base64 !== 'string' || base64.length > 7_000_000) throw new Error('Upload an XLSX file smaller than 5 MB.');
  const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer', cellDates: false });
  const sheetName = selectedSheet || workbook.SheetNames[0];
  if (!workbook.Sheets[sheetName]) throw new Error('Choose a sheet from the uploaded workbook.');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
  if (rows.length < 2) throw new Error('The selected sheet needs a header row and at least one data row.');
  return { ...importRowsPreview(item, rows), sheets: workbook.SheetNames, selectedSheet: sheetName };
}

function getImportPreview(item, body) {
  if (body.csv !== undefined) {
    if (typeof body.csv !== 'string' || body.csv.length > 5_000_000) throw new Error('Upload a CSV file smaller than 5 MB.');
    return importPreview(item, body.csv);
  }
  if (body.workbook !== undefined) return workbookPreview(item, body.workbook, body.sheet);
  throw new Error('Upload a CSV or XLSX file.');
}

function shouldCompress(size) { return size > 1024; }

function canReviewTransition(from, to) { return ({ submitted: ['approved', 'rejected'], approved: ['locked'] }[from] || []).includes(to); }

function jsonCached(res, code, body, cacheKey, ttl = cache.TTL.ANALYTICS) {
  const eTag = cache.getETag(body);
  const clientETag = res.req?.headers['if-none-match'];
  if (clientETag && cache.etagMatches(clientETag, eTag)) {
    res.writeHead(304, { 'ETag': eTag, 'Cache-Control': 'public, max-age=60' });
    return res.end();
  }
  const jsonStr = JSON.stringify(body);
  const encoding = (res.req?.headers['accept-encoding'] || '').includes('gzip') ? 'gzip' : null;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'ETag': eTag,
    'Cache-Control': 'public, max-age=60'
  };
  if (encoding && shouldCompress(jsonStr.length)) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(code, headers);
    zlib.gzip(jsonStr, (err, compressed) => {
      res.end(err ? jsonStr : compressed);
    });
  } else {
    res.writeHead(code, headers);
    res.end(jsonStr);
  }
}

const list = requirePermission('instrument:read', async (req, res, data, params) => {
  const searchParams = new URL(req.url, 'http://localhost').searchParams;
  const useCursor = searchParams.has('cursor');

  if (useCursor) {
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
    const cacheKey = cache.getCacheKey('instruments-list');
    let cached = cache.instrumentCache.get(cacheKey);
    if (!cached) {
      const offsetParams = pagination.parsePaginationParams(req.url);
      cached = pagination.formatResponse(pagination.applyQuery(data.instruments.map(safeInstrument), { filters: offsetParams.filter, search: offsetParams.search, searchFields: ['name'], sort: offsetParams.sort, page: offsetParams.page, limit: offsetParams.limit }));
      cache.instrumentCache.set(cacheKey, cached, cache.TTL.INSTRUMENTS);
    }
    return jsonCached(res, 200, cached, cacheKey, cache.TTL.INSTRUMENTS);
  }
});

const create = requirePermission('instrument:write', async (req, res, data, params) => {
  const body = await readBody(req);
  if (!body.name?.trim()) return json(res, 422, { error: 'An instrument name is required.' });
  if (body.programId && !data.programs.find(program => program.id === body.programId)) return json(res, 422, { error: 'Choose a valid program.' });
  const item = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    programId: body.programId || data.programs[0]?.id || null,
    status: 'draft',
    version: 0,
    collectionToken: null,
    updatedAt: new Date().toISOString(),
    sections: [{ id: crypto.randomUUID(), title: 'Section 1', description: '', questions: [] }],
    versions: []
  };
  data.instruments.push(item);
  audit(data, 'CREATE', 'instrument', item.id, { name: item.name, programId: item.programId });
  write(data);
  cache.invalidateInstrumentCache();
  cache.invalidateAnalyticsCache();
  return json(res, 201, safeInstrument(item));
});

const get = requirePermission('instrument:read', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  return json(res, 200, safeInstrument(item));
});

const update = requirePermission('instrument:write', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  if (item.status === 'published') return json(res, 409, { error: 'Published instruments are immutable. Create a new draft version.' });
  const body = await readBody(req);
  const errors = validateDefinition(body);
  if (errors.length) return json(res, 422, { errors });
  item.name = body.name.trim();
  item.sections = body.sections;
  item.updatedAt = new Date().toISOString();
  audit(data, 'UPDATE', 'instrument', item.id, { change: 'draft definition' });
  write(data);
  cache.invalidateInstrumentCache(item.id);
  cache.invalidateAnalyticsCache(item.id);
  return json(res, 200, safeInstrument(item));
});

const publish = requirePermission('instrument:publish', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  const errors = validateDefinition(item);
  if (errors.length) return json(res, 422, { errors });
  const published = { id: crypto.randomUUID(), version: item.version + 1, publishedAt: new Date().toISOString(), sections: structuredClone(item.sections) };
  item.versions.push(published);
  item.version = published.version;
  item.status = 'published';
  item.collectionToken ||= crypto.randomBytes(18).toString('base64url');
  item.updatedAt = published.publishedAt;
  audit(data, 'PUBLISH', 'instrument', item.id, { version: item.version });
  write(data);
  cache.invalidateInstrumentCache(item.id);
  cache.invalidateAnalyticsCache(item.id);
  return json(res, 201, { instrument: safeInstrument(item), collectionUrl: `/collect/${item.collectionToken}` });
});

const submissions = requirePermission('instrument:read', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  const pg = pagination.parsePaginationParams(req.url);
  const list = data.submissions.filter(s => s.instrumentId === item.id).map(({ answers, ...submission }) => ({ ...submission, answerCount: Object.keys(answers).length }));
  const result = pagination.applyQuery(list, { filters: pg.filter, search: pg.search, searchFields: ['id', 'status'], sort: pg.sort, page: pg.page, limit: pg.limit });
  return json(res, 200, pagination.formatResponse(result));
});

const dataset = requirePermission('instrument:read', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  const ds = datasetFor(data, item);
  return json(res, 200, ds);
});

const datasetExport = requirePermission('dataset:export', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  const ds = datasetFor(data, item);
  const headers = ['Response ID', 'Status', 'Submitted at', 'Instrument version', ...ds.columns.map(column => column.label)];
  const lines = [headers.map(csvValue).join(','), ...ds.records.map(record => [record.id, record.status, record.submittedAt, record.instrumentVersion, ...ds.columns.map(column => record.answers[column.key])].map(csvValue).join(','))];
  audit(data, 'EXPORT', 'dataset', ds.id, { format: 'csv', recordCount: ds.records.length, userId: req.user.id });
  write(data);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-responses.csv"`,
    'Cache-Control': 'no-store'
  });
  return res.end(lines.join('\n'));
});

const analytics = requirePermission('analytics:read', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  const ds = datasetFor(data, item);
  const searchParams = new URL(req.url, 'http://localhost').searchParams;
  const dimension = searchParams.get('dimension') || ds.columns[0]?.key;
  if (!dimension) return json(res, 422, { error: 'This dataset has no fields to analyze.' });
  const dateRange = searchParams.get('dateRange');
  let fromDate = null, toDate = new Date();
  if (dateRange && dateRange !== 'all') {
    const days = parseInt(dateRange);
    if (days > 0) { fromDate = new Date(toDate.getTime() - days * 86400000); }
  }
  const filteredDataset = fromDate ? { ...ds, records: ds.records.filter(record => new Date(record.submittedAt) >= fromDate) } : ds;
  return json(res, 200, aggregateDataset(filteredDataset, dimension));
});

const importPreviewHandler = requirePermission('dataset:import', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  const body = await readBody(req);
  try {
    return json(res, 200, getImportPreview(item, body));
  } catch (error) {
    return json(res, 422, { error: error.message });
  }
});

const importConfirm = requirePermission('dataset:import', async (req, res, data, params) => {
  const item = instrument(data, params.id);
  if (!item) return json(res, 404, { error: 'Instrument not found.' });
  const body = await readBody(req);
  let preview;
  try {
    preview = getImportPreview(item, body);
  } catch (error) {
    return json(res, 422, { error: error.message });
  }
  if (preview.problems.length) return json(res, 422, { error: 'Fix the import validation issues before importing.', problems: preview.problems });
  const importedAt = new Date().toISOString();
  const version = item.versions.at(-1)?.version || 0;
  preview.records.forEach(answers => data.submissions.push({ id: crypto.randomUUID(), instrumentId: item.id, instrumentVersion: version, status: 'submitted', source: 'import', answers, submittedAt: importedAt }));
  audit(data, 'IMPORT', 'dataset', `dataset-${item.id}`, { format: body.workbook ? 'xlsx' : 'csv', recordCount: preview.records.length });
  write(data);
  return json(res, 201, { imported: preview.records.length });
});

const fieldAccessGet = requirePermission('instrument:read', async (req, res, data, params) => {
  const inst = data.instruments?.find(i => i.id === params.id);
  if (!inst) return json(res, 404, { error: 'Instrument not found' });
  return json(res, 200, inst.fieldAccess || []);
});

const fieldAccessSet = requirePermission('instrument:write', async (req, res, data, params) => {
  const body = await readBody(req);
  const inst = data.instruments?.find(i => i.id === params.id);
  if (!inst) return json(res, 404, { error: 'Instrument not found' });
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
  if (!inst.fieldAccess) inst.fieldAccess = [];
  inst.fieldAccess.push(fieldAccess);
  audit(data, 'SET_FIELD_ACCESS', 'instrument', params.id, { fieldKey: body.fieldKey });
  write(data);
  return json(res, 201, fieldAccess);
});

module.exports = {
  list,
  create,
  get,
  update,
  publish,
  submissions,
  dataset,
  datasetExport,
  analytics,
  importPreviewHandler,
  importConfirm,
  fieldAccessGet,
  fieldAccessSet,
  validateDefinition,
  validateSubmission,
  datasetFor,
  aggregateDataset,
  isVisible,
  canReviewTransition,
  parseCsv,
  workbookPreview,
  importPreview
};
