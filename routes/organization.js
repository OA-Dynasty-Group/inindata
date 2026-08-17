const crypto = require('node:crypto');
const { requireAuth, requirePermission } = require('../lib/auth');
const { json, readBody, unauthorized } = require('../lib/json');
const pagination = require('../api/pagination');
const cache = require('../api/cache');
const storage = require('../db/storage');

function write(data) { storage.write(data); }

function audit(data, action, resourceType, resourceId, metadata = {}) {
  data.auditLogs.unshift({ id: crypto.randomUUID(), action, resourceType, resourceId, actor: 'local-admin', timestamp: new Date().toISOString(), metadata });
}

const get = requireAuth(async (req, res, data, params) => {
  return json(res, 200, data.organization);
});

const update = requirePermission('user:write', async (req, res, data, params) => {
  const body = await readBody(req);
  if (body.name?.trim()) {
    data.organization.name = body.name.trim();
    audit(data, 'UPDATE', 'organization', data.organization.id, { name: data.organization.name });
    write(data);
  }
  return json(res, 200, data.organization);
});

module.exports = { get, update };
