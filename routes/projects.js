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

const listMembers = requirePermission('project:manage', async (req, res, data, params) => {
  const project = data.projects?.find(p => p.id === params.id);
  if (!project) return json(res, 404, { error: 'Project not found' });
  return json(res, 200, project.members || []);
});

const addMember = requirePermission('project:manage', async (req, res, data, params) => {
  const body = await readBody(req);
  const project = data.projects?.find(p => p.id === params.id);
  if (!project) return json(res, 404, { error: 'Project not found' });
  if (!body.userId || !body.roleId) return json(res, 422, { error: 'userId and roleId required' });
  const member = { id: crypto.randomUUID(), userId: body.userId, roleId: body.roleId, permissions: body.permissions || [], addedAt: new Date().toISOString() };
  if (!project.members) project.members = [];
  project.members.push(member);
  audit(data, 'ADD_PROJECT_MEMBER', 'project', params.id, { userId: body.userId, roleId: body.roleId });
  write(data);
  return json(res, 201, member);
});

module.exports = { listMembers, addMember };
