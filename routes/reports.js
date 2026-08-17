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

function instrument(data, id) {
  return data.instruments.find(item => item.id === id);
}

function datasetFor(data, item) {
  const version = item.versions.at(-1);
  const sections = version?.sections || item.sections;
  const columns = sections.flatMap(section => section.questions).map(question => ({ key: question.key, label: question.label, type: question.type }));
  const records = data.submissions.filter(submission => submission.instrumentId === item.id).map(({ id, status, submittedAt, instrumentVersion, answers }) => ({ id, status, submittedAt, instrumentVersion, answers }));
  return { id: `dataset-${item.id}`, name: `${item.name} responses`, source: 'instrument', classification: 'Internal', columns, records };
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

const list = requirePermission('report:read', async (req, res, data, params) => {
  const pg = pagination.parsePaginationParams(req.url);
  const result = pagination.applyQuery(data.reports, {
    filters: pg.filter,
    search: pg.search,
    searchFields: ['title', 'narrative'],
    sort: pg.sort,
    page: pg.page,
    limit: pg.limit
  });
  return json(res, 200, pagination.formatResponse(result));
});

const create = requirePermission('report:write', async (req, res, data, params) => {
  const body = await readBody(req);
  const item = instrument(data, body.instrumentId);
  if (!body.title?.trim() || !item) return json(res, 422, { error: 'A report title and valid instrument are required.' });
  const ds = datasetFor(data, item);
  try {
    aggregateDataset(ds, body.dimension);
  } catch (error) {
    return json(res, 422, { error: error.message });
  }
  const report = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    instrumentId: item.id,
    dimension: body.dimension,
    narrative: String(body.narrative || '').trim(),
    createdAt: new Date().toISOString(),
    createdBy: req.user.id
  };
  data.reports.unshift(report);
  audit(data, 'CREATE', 'report', report.id, { title: report.title, instrumentId: item.id });
  write(data);
  return json(res, 201, report);
});

module.exports = { list, create };
