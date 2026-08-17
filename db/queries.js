// Common database query functions
const { query, transaction } = require('./pool');

/**
 * Organization queries
 */
async function getOrganization(orgId) {
  const result = await query('SELECT * FROM fieldwork.organizations WHERE id = $1 AND deleted_at IS NULL', [orgId]);
  return result.rows[0];
}

async function createOrganization(name, slug) {
  const result = await query(
    'INSERT INTO fieldwork.organizations (name, slug) VALUES ($1, $2) RETURNING *',
    [name, slug]
  );
  return result.rows[0];
}

/**
 * User queries
 */
async function getUserByEmail(orgId, email) {
  const result = await query(
    'SELECT * FROM fieldwork.users WHERE organization_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL',
    [orgId, email]
  );
  return result.rows[0];
}

async function getUserById(userId) {
  const result = await query('SELECT * FROM fieldwork.users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  return result.rows[0];
}

async function listUsers(orgId) {
  const result = await query(
    'SELECT u.*, jsonb_agg(r.code) as roles FROM fieldwork.users u LEFT JOIN fieldwork.user_roles ur ON u.id = ur.user_id LEFT JOIN fieldwork.roles r ON ur.role_id = r.id WHERE u.organization_id = $1 AND u.deleted_at IS NULL GROUP BY u.id ORDER BY u.created_at DESC',
    [orgId]
  );
  return result.rows;
}

async function createUser(orgId, email, displayName, passwordHash) {
  const result = await query(
    'INSERT INTO fieldwork.users (organization_id, email, display_name, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
    [orgId, email, displayName, passwordHash]
  );
  return result.rows[0];
}

async function updateUserStatus(userId, status) {
  const result = await query(
    'UPDATE fieldwork.users SET status = $1, updated_at = clock_timestamp() WHERE id = $2 RETURNING *',
    [status, userId]
  );
  return result.rows[0];
}

async function grantUserRole(userId, roleId) {
  await query(
    'INSERT INTO fieldwork.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, roleId]
  );
}

/**
 * Program queries
 */
async function listPrograms(orgId) {
  const result = await query(
    'SELECT * FROM fieldwork.programs WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
    [orgId]
  );
  return result.rows;
}

async function createProgram(orgId, code, name, description, createdByUserId) {
  const result = await query(
    'INSERT INTO fieldwork.programs (organization_id, code, name, description, created_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [orgId, code, name, description, createdByUserId]
  );
  return result.rows[0];
}

async function getProgram(programId) {
  const result = await query(
    'SELECT * FROM fieldwork.programs WHERE id = $1 AND deleted_at IS NULL',
    [programId]
  );
  return result.rows[0];
}

/**
 * Project queries
 */
async function createProject(orgId, programId, code, name, createdByUserId) {
  const result = await query(
    'INSERT INTO fieldwork.projects (organization_id, program_id, code, name, created_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [orgId, programId, code, name, createdByUserId]
  );
  return result.rows[0];
}

async function getProjectsForProgram(programId) {
  const result = await query(
    'SELECT * FROM fieldwork.projects WHERE program_id = $1 AND deleted_at IS NULL ORDER BY created_at',
    [programId]
  );
  return result.rows;
}

/**
 * Instrument queries
 */
async function listInstruments(orgId, programId = null) {
  let sql = 'SELECT * FROM fieldwork.instruments WHERE organization_id = $1 AND deleted_at IS NULL';
  const params = [orgId];
  
  if (programId) {
    sql += ' AND program_id = $2';
    params.push(programId);
  }
  
  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows;
}

async function getInstrument(instrumentId) {
  const result = await query(
    'SELECT * FROM fieldwork.instruments WHERE id = $1 AND deleted_at IS NULL',
    [instrumentId]
  );
  return result.rows[0];
}

async function createInstrument(orgId, key, title, programId, createdByUserId) {
  const result = await query(
    'INSERT INTO fieldwork.instruments (organization_id, key, title, program_id, created_by_user_id, draft_definition) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [orgId, key, title, programId, createdByUserId, JSON.stringify({ sections: [] })]
  );
  return result.rows[0];
}

async function updateInstrumentDraft(instrumentId, definition) {
  const result = await query(
    'UPDATE fieldwork.instruments SET draft_definition = $1, updated_at = clock_timestamp() WHERE id = $2 RETURNING *',
    [JSON.stringify(definition), instrumentId]
  );
  return result.rows[0];
}

async function publishInstrument(instrumentId, publishedByUserId) {
  return transaction(async (client) => {
    // Get current draft
    const instResult = await client.query(
      'SELECT draft_definition FROM fieldwork.instruments WHERE id = $1',
      [instrumentId]
    );
    const instrument = instResult.rows[0];
    
    // Get next version number
    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM fieldwork.instrument_versions WHERE instrument_id = $1',
      [instrumentId]
    );
    const nextVersion = versionResult.rows[0].next_version;
    
    // Create checksum
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(JSON.stringify(instrument.draft_definition)).digest('hex');
    
    // Insert version
    await client.query(
      'INSERT INTO fieldwork.instrument_versions (instrument_id, version_number, definition, definition_checksum, published_by_user_id) VALUES ($1, $2, $3, $4, $5)',
      [instrumentId, nextVersion, JSON.stringify(instrument.draft_definition), checksum, publishedByUserId]
    );
    
    // Update instrument status
    const result = await client.query(
      'UPDATE fieldwork.instruments SET status = $1, updated_at = clock_timestamp() WHERE id = $2 RETURNING *',
      ['published', instrumentId]
    );
    
    return result.rows[0];
  });
}

/**
 * Submission queries
 */
async function listSubmissions(instrumentId, limit = 100, offset = 0) {
  const result = await query(
    'SELECT * FROM fieldwork.submissions WHERE instrument_id = $1 ORDER BY submitted_at DESC LIMIT $2 OFFSET $3',
    [instrumentId, limit, offset]
  );
  return result.rows;
}

async function createSubmission(instrumentId, instrumentVersion, answers, source = 'form') {
  const result = await query(
    'INSERT INTO fieldwork.submissions (instrument_id, instrument_version, answers, source, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [instrumentId, instrumentVersion, JSON.stringify(answers), source, 'submitted']
  );
  return result.rows[0];
}

async function getSubmission(submissionId) {
  const result = await query(
    'SELECT * FROM fieldwork.submissions WHERE id = $1',
    [submissionId]
  );
  return result.rows[0];
}

async function updateSubmissionStatus(submissionId, status, reviewedByUserId = null) {
  const result = await query(
    'UPDATE fieldwork.submissions SET status = $1, reviewed_at = clock_timestamp(), reviewed_by_user_id = $2, updated_at = clock_timestamp() WHERE id = $3 RETURNING *',
    [status, reviewedByUserId, submissionId]
  );
  return result.rows[0];
}

/**
 * Audit log queries
 */
async function createAuditEvent(orgId, action, resourceType, resourceId, userId, metadata = {}) {
  await query(
    'INSERT INTO fieldwork.audit_events (organization_id, action, resource_type, resource_id, user_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
    [orgId, action, resourceType, resourceId, userId, JSON.stringify(metadata)]
  );
}

async function listAuditEvents(orgId, limit = 100, offset = 0) {
  const result = await query(
    'SELECT * FROM fieldwork.audit_events WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [orgId, limit, offset]
  );
  return result.rows;
}

/**
 * Role queries
 */
async function getRoleByCode(orgId, code) {
  const result = await query(
    'SELECT * FROM fieldwork.roles WHERE organization_id = $1 AND code = $2 AND deleted_at IS NULL',
    [orgId, code]
  );
  return result.rows[0];
}

async function listRoles(orgId) {
  const result = await query(
    'SELECT * FROM fieldwork.roles WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at',
    [orgId]
  );
  return result.rows;
}

/**
 * Session queries
 */
async function createSession(userId, tokenHash, expiresAt, ip, userAgent) {
  const result = await query(
    'INSERT INTO fieldwork.auth_sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [userId, tokenHash, expiresAt, ip, userAgent]
  );
  return result.rows[0];
}

async function getSessionByHash(tokenHash) {
  const result = await query(
    'SELECT * FROM fieldwork.auth_sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()',
    [tokenHash]
  );
  return result.rows[0];
}

async function revokeSession(sessionId) {
  await query(
    'UPDATE fieldwork.auth_sessions SET revoked_at = clock_timestamp() WHERE id = $1',
    [sessionId]
  );
}

module.exports = {
  // Organization
  getOrganization,
  createOrganization,
  // Users
  getUserByEmail,
  getUserById,
  listUsers,
  createUser,
  updateUserStatus,
  grantUserRole,
  // Programs
  listPrograms,
  createProgram,
  getProgram,
  // Projects
  createProject,
  getProjectsForProgram,
  // Instruments
  listInstruments,
  getInstrument,
  createInstrument,
  updateInstrumentDraft,
  publishInstrument,
  // Submissions
  listSubmissions,
  createSubmission,
  getSubmission,
  updateSubmissionStatus,
  // Audit
  createAuditEvent,
  listAuditEvents,
  // Roles
  getRoleByCode,
  listRoles,
  // Sessions
  createSession,
  getSessionByHash,
  revokeSession,
};
