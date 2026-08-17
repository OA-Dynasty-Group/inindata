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

const list = requirePermission('program:read', async (req, res, data, params) => {
  const pg = pagination.parsePaginationParams(req.url);
  const result = pagination.applyQuery(data.programs, {
    filters: pg.filter,
    search: pg.search,
    searchFields: ['name', 'code', 'description'],
    sort: pg.sort,
    page: pg.page,
    limit: pg.limit
  });
  return json(res, 200, pagination.formatResponse(result));
});

const create = requirePermission('program:write', async (req, res, data, params) => {
  const body = await readBody(req);
  if (!body.name?.trim()) return json(res, 422, { error: 'A program name is required.' });
  const program = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    code: String(body.code || '').trim(),
    description: String(body.description || '').trim(),
    status: 'planned',
    projects: []
  };
  data.programs.push(program);
  audit(data, 'CREATE', 'program', program.id, { name: program.name });
  write(data);
  return json(res, 201, program);
});

const createProject = requirePermission('program:write', async (req, res, data, params) => {
  const program = data.programs.find(item => item.id === params.id);
  if (!program) return json(res, 404, { error: 'Program not found.' });
  const body = await readBody(req);
  if (!body.name?.trim()) return json(res, 422, { error: 'A project name is required.' });
  const project = { id: crypto.randomUUID(), name: body.name.trim(), status: 'planned' };
  program.projects.push(project);
  audit(data, 'CREATE', 'project', project.id, { programId: program.id, name: project.name });
  write(data);
  return json(res, 201, project);
});

module.exports = { list, create, createProject };
