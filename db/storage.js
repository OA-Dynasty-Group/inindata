// Storage abstraction layer - supports Supabase REST API, PostgreSQL, and file-based storage
// Routes to appropriate backend based on environment variables:
// - SUPABASE_URL + SUPABASE_ANON_KEY = Supabase REST API (serverless-optimized)
// - DATABASE_URL = Direct PostgreSQL connection
// - Neither = File-based storage (development mode)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Determine which backend to use
let USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
let USE_DATABASE = !!process.env.DATABASE_URL;

let db = null;
let queries = null;

// Lazy-load database modules based on environment
if (USE_SUPABASE) {
  console.log('[Storage] Using Supabase REST API (serverless-optimized)');
  try {
    const supabaseClient = require('./supabase-client');
    db = supabaseClient.pool;
    queries = supabaseClient.queries;
  } catch (err) {
    console.error('Failed to load Supabase modules:', err.message);
    console.error('Falling back to file-based storage');
    USE_SUPABASE = false;
  }
} else if (USE_DATABASE) {
  console.log('[Storage] Using PostgreSQL direct connection');
  try {
    db = require('./pool');
    queries = require('./queries');
  } catch (err) {
    console.error('Failed to load database modules:', err.message);
    console.error('Falling back to file-based storage');
    USE_DATABASE = false;
  }
} else {
  console.log('[Storage] Using file-based storage (development mode)');
}

const USE_DB = USE_SUPABASE || USE_DATABASE;

// File-based storage implementation
const FileStore = (() => {
  const isVercel = !!process.env.VERCEL;
  const ROOT = path.join(__dirname, '..');
  const DATA_DIR = isVercel ? path.join('/tmp', 'fieldwork-data') : path.join(ROOT, 'data');
  const DATA_FILE = path.join(DATA_DIR, 'store.json');
  
  const load = () => {
    if (!fs.existsSync(DATA_FILE)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const data = initialData();
        write(data);
        return data;
      } catch (err) {
        console.error('[Storage] Cannot write data file:', err.message);
        return initialData();
      }
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let changed = false;
    const seed = initialData();
    
    if (!data.users?.length) { data.users = seed.users; changed = true; }
    if (!data.programs?.length) { data.programs = seed.programs; data.instruments.forEach(item => { item.programId ||= seed.programs[0].id; }); changed = true; }
    if (!data.reports) { data.reports = []; changed = true; }
    if (!data.dashboards) { data.dashboards = []; changed = true; }
    for (const user of data.users) if (user.roles?.includes('organization_admin')) for (const perm of Object.keys(ADMIN_PERMS)) if (!user.permissions.includes(perm)) { user.permissions.push(perm); changed = true; }
    
    if (changed) write(data);
    return data;
  };
  
  const write = (data) => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[Storage] Cannot write data file:', err.message);
    }
  };
  
  return { load, write };
})();

// Constant permissions
const ADMIN_PERMS = {
  'user:read': true, 'user:write': true, 'program:read': true, 'program:write': true,
  'instrument:read': true, 'instrument:write': true, 'instrument:publish': true,
  'submission:review': true, 'dataset:import': true, 'dataset:export': true,
  'analytics:read': true, 'dashboard:read': true, 'dashboard:write': true,
  'report:read': true, 'report:write': true, 'audit:read': true,
  'project:manage': true, 'data:pii_view': true, 'data:export_pii': true
};

const ADMIN_PERMS_ARRAY = Object.keys(ADMIN_PERMS);

const ROLE_PERMISSIONS = {
  organization_admin: ADMIN_PERMS_ARRAY,
  program_manager: ['program:read', 'program:write', 'instrument:read', 'instrument:write', 'instrument:publish', 'submission:review', 'dataset:import', 'dataset:export', 'analytics:read', 'report:read', 'report:write', 'project:manage', 'data:pii_view', 'data:export_pii'],
  reviewer: ['instrument:read', 'submission:review'],
  analyst: ['instrument:read', 'dataset:export', 'analytics:read', 'report:read', 'report:write', 'data:pii_view'],
  field_worker: ['instrument:read']
};

// Initial data seed
function initialData() {
  const now = new Date().toISOString();
  const adminPassword = process.env.FIELDWORK_BOOTSTRAP_PASSWORD || 'change-me-now';
  const password = passwordHash(adminPassword);
  
  return {
    organization: { id: 'org-community-reach', name: 'Community Reach' },
    users: [{
      id: 'user-local-admin', name: 'Amina Mensah', email: 'admin@communityreach.local',
      status: 'active', roles: ['organization_admin'], permissions: ADMIN_PERMS_ARRAY,
      password
    }],
    programs: [{
      id: 'program-youth-employment', name: 'Youth Employment', code: 'YE-2026',
      description: 'Supporting young people to access skills, work, and opportunity.',
      status: 'active', projects: [{ id: 'project-skills-training', name: 'Skills Training Project', status: 'active' }]
    }],
    reports: [], dashboards: [],
    instruments: [{
      id: 'instrument-community-needs', name: 'Community needs assessment',
      programId: 'program-youth-employment', status: 'draft', version: 0,
      collectionToken: null, updatedAt: now,
      sections: [{
        id: 'section-1', title: 'About you',
        description: 'A few questions to help us understand your context.',
        questions: [
          { id: 'q-1', key: 'full_name', type: 'shortText', label: 'What is your full name?', help: '', required: true, options: [] },
          { id: 'q-2', key: 'community', type: 'singleSelect', label: 'Which community do you live in?', help: 'Select one option', required: true, options: ['Harbour View', 'North End', 'Riverside'] },
          { id: 'q-3', key: 'household_size', type: 'number', label: 'How many people live in your household?', help: '', required: false, options: [] }
        ]
      }],
      versions: []
    }],
    submissions: [],
    auditLogs: []
  };
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex') };
}

function passwordsMatch(password, user) {
  const candidate = passwordHash(password, user.password.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.password.hash, 'hex'));
}

// Phase 4: Advanced Permissions

/**
 * Get all projects a user can access
 */
async function getUserProjectAccess(userId, organizationId) {
  if (!USE_DB) return []; // File-based storage doesn't track project membership
  
  try {
    const query = `
      SELECT pm.project_id, pm.role_id, pm.permissions, p.name, p.status
      FROM fieldwork.project_members pm
      JOIN fieldwork.projects p ON p.id = pm.project_id
      WHERE pm.user_id = $1 AND pm.organization_id = $2
      ORDER BY p.name
    `;
    const result = await db.query(query, [userId, organizationId]);
    return result.rows;
  } catch (error) {
    console.error('Error getting user project access:', error);
    return [];
  }
}

/**
 * Check if user has access to a specific field
 */
async function canUserAccessField(userId, instrumentId, fieldKey) {
  if (!USE_DB) return true; // File-based storage allows all field access
  
  try {
    // Admin users can access all fields
    const user = await db.query('SELECT roles FROM fieldwork.users WHERE id = $1', [userId]);
    if (!user.rows.length) return false;
    
    // Check explicit user-level field access
    const userAccess = await db.query(
      `SELECT can_view FROM fieldwork.field_access 
       WHERE user_id = $1 AND instrument_id = $2 AND field_key = $3`,
      [userId, instrumentId, fieldKey]
    );
    if (userAccess.rows.length) return userAccess.rows[0].can_view;
    
    // Check role-level field access
    const roleIds = user.rows[0].roles || [];
    if (roleIds.length) {
      const roleAccess = await db.query(
        `SELECT can_view FROM fieldwork.field_access 
         WHERE role_id = ANY($1) AND instrument_id = $2 AND field_key = $3
         ORDER BY can_view DESC LIMIT 1`,
        [roleIds, instrumentId, fieldKey]
      );
      if (roleAccess.rows.length) return roleAccess.rows[0].can_view;
    }
    
    // Default: allow access to public fields, deny to restricted
    return true;
  } catch (error) {
    console.error('Error checking field access:', error);
    return false;
  }
}

/**
 * Filter fields from submission data based on user access
 */
async function filterSubmissionFields(submission, userId, instrumentId) {
  if (!USE_DB) return submission; // File-based storage returns all fields
  
  const filteredData = { ...submission };
  const keys = Object.keys(filteredData.data || {});
  
  for (const key of keys) {
    const hasAccess = await canUserAccessField(userId, instrumentId, key);
    if (!hasAccess) {
      filteredData.data[key] = '[RESTRICTED]'; // Mask restricted fields
    }
  }
  
  return filteredData;
}

/**
 * Get accessible columns for dataset based on user permissions
 */
async function getAccessibleColumns(userId, organizationId, instrumentId) {
  if (!USE_DB) return null; // File-based storage returns all columns
  
  try {
    // Get instrument definition
    const inst = await db.query(
      'SELECT config FROM fieldwork.instruments WHERE id = $1 AND organization_id = $2',
      [instrumentId, organizationId]
    );
    
    if (!inst.rows.length) return null;
    
    const config = inst.rows[0].config;
    const allFields = config.sections?.flatMap(s => s.fields) || [];
    
    const accessible = [];
    for (const field of allFields) {
      const canAccess = await canUserAccessField(userId, instrumentId, field.key);
      if (canAccess) {
        accessible.push(field);
      }
    }
    
    return accessible;
  } catch (error) {
    console.error('Error getting accessible columns:', error);
    return null;
  }
}

/**
 * Log data access for audit trail
 */
async function logDataAccess(userId, organizationId, action, resourceType, resourceId, status, reason = null) {
  if (!USE_DB) return; // File-based storage doesn't track access logs
  
  try {
    await db.query(
      `INSERT INTO fieldwork.access_logs 
       (organization_id, user_id, action, resource_type, resource_id, status, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [organizationId, userId, action, resourceType, resourceId, status, reason]
    );
  } catch (error) {
    console.error('Error logging data access:', error);
  }
}

// Public API
module.exports = {
  USE_DATABASE: USE_DB, // Backward compatibility
  USE_DB,
  USE_SUPABASE,
  ADMIN_PERMS_ARRAY,
  ROLE_PERMISSIONS,
  
  // Data operations
  load: () => FileStore.load(),
  write: (data) => FileStore.write(data),
  
  // Utilities
  passwordHash,
  passwordsMatch,
  initialData,
  
  // Phase 4: Advanced Permissions
  getUserProjectAccess,
  canUserAccessField,
  filterSubmissionFields,
  getAccessibleColumns,
  logDataAccess,
  
  // Get database connection for advanced operations
  getDb: () => db,
  getQueries: () => queries,
};
