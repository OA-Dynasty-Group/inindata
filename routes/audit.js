const crypto = require('node:crypto');
const { requireAuth, requirePermission } = require('../lib/auth');
const { json, readBody, unauthorized } = require('../lib/json');
const pagination = require('../api/pagination');
const cache = require('../api/cache');
const storage = require('../db/storage');

const list = requirePermission('audit:read', async (req, res, data, params) => {
  const pg = pagination.parsePaginationParams(req.url);
  const result = pagination.applyQuery(data.auditLogs, {
    filters: pg.filter,
    search: pg.search,
    searchFields: ['action', 'resourceType'],
    sort: pg.sort || '-timestamp',
    page: pg.page,
    limit: pg.limit
  });
  return json(res, 200, pagination.formatResponse(result));
});

module.exports = { list };
