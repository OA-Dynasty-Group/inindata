const { requireAuth, requirePermission } = require('../lib/auth');
const { json, readBody, unauthorized } = require('../lib/json');
const pagination = require('../api/pagination');
const cache = require('../api/cache');
const storage = require('../db/storage');
const email = require('../email/service');

const health = async (req, res, data, params) => {
  return json(res, 200, { status: 'ok' });
};

const healthDb = async (req, res, data, params) => {
  if (!storage.USE_DATABASE) {
    return json(res, 200, { status: 'ok', database: 'file-based' });
  }
  try {
    const db = storage.getDb();
    if (!db) return json(res, 503, { status: 'unavailable', error: 'Database not initialized' });
    const result = await db.health();
    return json(res, result.ok ? 200 : 503, result);
  } catch (error) {
    return json(res, 503, { status: 'error', error: error.message });
  }
};

const healthEmail = async (req, res, data, params) => {
  const result = await email.health();
  return json(res, result.status === 'ok' ? 200 : result.status === 'disabled' ? 200 : 503, result);
};

module.exports = { health, healthDb, healthEmail };
