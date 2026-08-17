const crypto = require('node:crypto');
const { requireAuth, requirePermission } = require('../lib/auth');
const { json, readBody, unauthorized } = require('../lib/json');
const pagination = require('../api/pagination');
const cache = require('../api/cache');
const storage = require('../db/storage');
const email = require('../email/service');

function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function rolePermissions(role) {
  return storage.ROLE_PERMISSIONS[role] || [];
}

const list = requirePermission('user:read', async (req, res, data, params) => {
  const pg = pagination.parsePaginationParams(req.url);
  const result = pagination.applyQuery(data.users.map(publicUser), {
    filters: pg.filter,
    search: pg.search,
    searchFields: ['name', 'email'],
    sort: pg.sort,
    page: pg.page,
    limit: pg.limit
  });
  return json(res, 200, pagination.formatResponse(result));
});

const create = requirePermission('user:write', async (req, res, data, params) => {
  const body = await readBody(req);
  const emailAddr = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || 'field_worker');
  if (!body.name?.trim() || !/^\S+@\S+\.\S+$/.test(emailAddr) || String(body.password || '').length < 12 || !storage.ROLE_PERMISSIONS[role]) {
    return json(res, 422, { error: 'Provide a name, valid email, a password of at least 12 characters, and a valid role.' });
  }
  if (data.users.some(user => user.email === emailAddr)) {
    return json(res, 409, { error: 'A user with this email already exists.' });
  }
  const user = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    email: emailAddr,
    status: 'active',
    roles: [role],
    permissions: rolePermissions(role),
    password: storage.passwordHash(body.password)
  };
  data.users.push(user);
  data.auditLogs.unshift({ id: crypto.randomUUID(), action: 'CREATE', resourceType: 'user', resourceId: user.id, actor: 'local-admin', timestamp: new Date().toISOString(), metadata: { email: user.email, role } });
  storage.write(data);
  if (email.ENABLED) {
    email.sendEmail(user.email, 'Welcome to ' + data.organization.name, `Welcome ${user.name}! You have been added to ${data.organization.name}. Your initial password has been set.`, `<h2>Welcome to ${data.organization.name}</h2><p>Hello ${user.name},</p><p>You have been added to <strong>${data.organization.name}</strong>.</p><p>You can now sign in with:</p><ul><li><strong>Email:</strong> ${user.email}</li><li><strong>Password:</strong> The one provided to you</li></ul><p><a href="${process.env.FIELDWORK_PUBLIC_URL || 'http://localhost:3000'}" style="display:inline-block;padding:12px 20px;background:#0066cc;color:white;text-decoration:none;border-radius:4px;">Sign in to ${data.organization.name}</a></p>`).catch(err => console.error('[Email] Failed to send welcome email:', err.message));
  }
  return json(res, 201, publicUser(user));
});

const updateStatus = requirePermission('user:write', async (req, res, data, params) => {
  const user = data.users.find(item => item.id === params.id);
  const body = await readBody(req);
  if (!user) return json(res, 404, { error: 'User not found.' });
  if (!['active', 'suspended', 'deactivated'].includes(body.status)) {
    return json(res, 422, { error: 'Use active, suspended, or deactivated.' });
  }
  if (user.id === req.user.id && body.status !== 'active') {
    return json(res, 422, { error: 'You cannot disable your own account.' });
  }
  user.status = body.status;
  data.auditLogs.unshift({ id: crypto.randomUUID(), action: 'UPDATE', resourceType: 'user', resourceId: user.id, actor: 'local-admin', timestamp: new Date().toISOString(), metadata: { status: user.status } });
  storage.write(data);
  return json(res, 200, publicUser(user));
});

module.exports = { list, create, updateStatus };
