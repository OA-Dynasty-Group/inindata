// Storage abstraction layer - Supabase-only with PostgreSQL fallback
// File-based storage is completely removed
// Supported backends:
// - Supabase: SUPABASE_URL + SUPABASE_ANON_KEY (recommended for production)
// - PostgreSQL: DATABASE_URL or DATABASE_URL_PGBOUNCER (self-hosted)

const crypto = require('crypto');

// Startup validation: require Supabase or PostgreSQL
const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
const USE_DATABASE = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_PGBOUNCER);

if (!USE_SUPABASE && !USE_DATABASE) {
  const msg = '[Storage] FATAL: Database configuration required.\n' +
    '  For Supabase: set SUPABASE_URL and SUPABASE_ANON_KEY\n' +
    '  For PostgreSQL: set DATABASE_URL or DATABASE_URL_PGBOUNCER\n' +
    'File-based storage is not supported. Database is required.';
  console.error(msg);
  throw new Error(msg);
}

let db = null;
let queries = null;

if (USE_SUPABASE) {
  console.log('[Storage] Initializing Supabase connection');
  try {
    const supabaseClient = require('./supabase-client');
    db = supabaseClient.pool;
    queries = supabaseClient.queries;
  } catch (err) {
    console.error('[Storage] Failed to load Supabase client:', err.message);
    throw err;
  }
} else if (USE_DATABASE) {
  console.log('[Storage] Initializing PostgreSQL connection');
  try {
    db = require('./pool');
    queries = require('./queries');
  } catch (err) {
    console.error('[Storage] Failed to load PostgreSQL client:', err.message);
    throw err;
  }
}

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

// Public API - Database-backed storage only
module.exports = {
  // Database backend flags
  USE_DATABASE: USE_SUPABASE || USE_DATABASE,
  USE_SUPABASE,
  USE_POSTGRESQL: USE_DATABASE && !USE_SUPABASE,
  
  // Permission constants
  ADMIN_PERMS_ARRAY,
  ROLE_PERMISSIONS,
  
  // Core data operations (requires implementing database queries)
  // These will use the database layer instead of FileStore
  load: () => {
    if (!db || !queries) {
      throw new Error('[Storage] Database not initialized. Cannot load data.');
    }
    // TODO: Implement full database load (loads all entities from DB tables into memory)
    // For now, returns initialData seed
    console.warn('[Storage] Full database load not yet implemented. Using seed data only.');
    return initialData();
  },
  
  write: (data) => {
    if (!db || !queries) {
      throw new Error('[Storage] Database not initialized. Cannot persist data.');
    }
    // TODO: Implement full database write (persists all entities to DB tables)
    console.warn('[Storage] Full database write not yet implemented. Use route-specific database queries.');
  },
  
  // Utility functions
  passwordHash,
  passwordsMatch,
  initialData,
  
  // Phase 4: Advanced Permissions (database-backed)
  getUserProjectAccess,
  canUserAccessField,
  filterSubmissionFields,
  getAccessibleColumns,
  logDataAccess,
  
  // Database access (for advanced operations and direct queries)
  getDb: () => db,
  getQueries: () => queries,
};
