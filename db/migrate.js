// Data migration utilities - convert file store to PostgreSQL
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { transaction } = require('./pool');
const queries = require('./queries');

/**
 * Load current file-based store
 */
function loadFileStore() {
  const storePath = path.join(__dirname, '..', 'data', 'store.json');
  if (!fs.existsSync(storePath)) {
    throw new Error('data/store.json not found. Start the server first to generate it.');
  }
  const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  return data;
}

/**
 * Migrate data from file store to PostgreSQL
 * This is a one-time operation during initial deployment
 */
async function migrateFromFileStore(orgId) {
  const data = loadFileStore();
  
  return transaction(async (client) => {
    console.log('Starting migration from file store to PostgreSQL...');
    
    // Migrate organization
    console.log('Migrating organization...');
    await client.query(
      'INSERT INTO fieldwork.organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [orgId, data.organization.name, data.organization.name.toLowerCase().replace(/\s+/g, '-')]
    );
    
    // Migrate users
    console.log(`Migrating ${data.users.length} users...`);
    for (const user of data.users) {
      const passwordHash = user.password.hash;
      const passwordSalt = user.password.salt;
      
      await client.query(
        'INSERT INTO fieldwork.users (id, organization_id, email, display_name, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [user.id, orgId, user.email, user.name, `${passwordSalt}:${passwordHash}`, 'active']
      );
    }
    
    // Create default roles
    console.log('Creating default roles...');
    const roles = [
      { code: 'organization_admin', name: 'Organization Administrator', permissions: ['*'] },
      { code: 'program_manager', name: 'Program Manager', permissions: ['program:*', 'instrument:*'] },
      { code: 'reviewer', name: 'Reviewer', permissions: ['submission:review'] },
      { code: 'analyst', name: 'Data Analyst', permissions: ['analytics:read', 'dataset:export'] },
      { code: 'field_worker', name: 'Field Worker', permissions: ['instrument:read'] },
    ];
    
    for (const role of roles) {
      await client.query(
        'INSERT INTO fieldwork.roles (id, organization_id, code, name, is_system, permissions) VALUES (gen_random_uuid(), $1, $2, $3, true, $4) ON CONFLICT DO NOTHING',
        [orgId, role.code, role.name, JSON.stringify(role.permissions)]
      );
    }
    
    // Assign users to roles
    console.log('Assigning roles to users...');
    for (const user of data.users) {
      for (const roleCode of user.roles || []) {
        const roleResult = await client.query(
          'SELECT id FROM fieldwork.roles WHERE organization_id = $1 AND code = $2',
          [orgId, roleCode]
        );
        if (roleResult.rows.length > 0) {
          await client.query(
            'INSERT INTO fieldwork.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user.id, roleResult.rows[0].id]
          );
        }
      }
    }
    
    // Migrate programs
    console.log(`Migrating ${data.programs.length} programs...`);
    for (const program of data.programs) {
      await client.query(
        'INSERT INTO fieldwork.programs (id, organization_id, code, name, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [program.id, orgId, program.code, program.name, program.description]
      );
      
      // Migrate projects
      for (const project of program.projects) {
        await client.query(
          'INSERT INTO fieldwork.projects (id, organization_id, program_id, code, name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
          [project.id, orgId, program.id, project.name.toLowerCase().replace(/\s+/g, '-'), project.name]
        );
      }
    }
    
    // Migrate instruments
    console.log(`Migrating ${data.instruments.length} instruments...`);
    for (const instrument of data.instruments) {
      const versionNumber = instrument.version || 0;
      
      await client.query(
        'INSERT INTO fieldwork.instruments (id, organization_id, program_id, key, title, status, draft_definition) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
        [
          instrument.id,
          orgId,
          instrument.programId,
          instrument.id.replace('instrument-', ''),
          instrument.name,
          instrument.status,
          JSON.stringify(instrument),
        ]
      );
      
      // Migrate published versions
      for (const version of instrument.versions) {
        const checksum = crypto.createHash('sha256')
          .update(JSON.stringify(version.sections))
          .digest('hex');
        
        await client.query(
          'INSERT INTO fieldwork.instrument_versions (id, instrument_id, version_number, definition, definition_checksum, published_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
          [
            version.id || crypto.randomUUID(),
            instrument.id,
            version.version,
            JSON.stringify(version),
            checksum,
            version.publishedAt || new Date().toISOString(),
          ]
        );
      }
    }
    
    // Migrate submissions
    console.log(`Migrating ${data.submissions.length} submissions...`);
    for (const submission of data.submissions) {
      await client.query(
        'INSERT INTO fieldwork.submissions (id, instrument_id, instrument_version, answers, status, submitted_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [
          submission.id,
          submission.instrumentId,
          submission.instrumentVersion,
          JSON.stringify(submission.answers),
          submission.status,
          submission.submittedAt,
        ]
      );
    }
    
    // Migrate audit logs
    console.log(`Migrating ${data.auditLogs.length} audit events...`);
    for (const log of data.auditLogs) {
      await client.query(
        'INSERT INTO fieldwork.audit_events (id, organization_id, action, resource_type, resource_id, user_id, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING',
        [
          log.id,
          orgId,
          log.action,
          log.resourceType,
          log.resourceId,
          log.actor,
          JSON.stringify(log.metadata),
          log.timestamp,
        ]
      );
    }
    
    console.log('✓ Migration complete! Data successfully migrated to PostgreSQL.');
    return {
      users: data.users.length,
      programs: data.programs.length,
      instruments: data.instruments.length,
      submissions: data.submissions.length,
      auditLogs: data.auditLogs.length,
    };
  });
}

/**
 * Verify migration was successful
 */
async function verifyMigration(orgId) {
  const fileData = loadFileStore();
  
  const counts = await transaction(async (client) => {
    const users = await client.query('SELECT COUNT(*) as count FROM fieldwork.users WHERE organization_id = $1', [orgId]);
    const programs = await client.query('SELECT COUNT(*) as count FROM fieldwork.programs WHERE organization_id = $1', [orgId]);
    const instruments = await client.query('SELECT COUNT(*) as count FROM fieldwork.instruments WHERE organization_id = $1', [orgId]);
    const submissions = await client.query('SELECT COUNT(*) as count FROM fieldwork.submissions', []);
    
    return {
      users: parseInt(users.rows[0].count),
      programs: parseInt(programs.rows[0].count),
      instruments: parseInt(instruments.rows[0].count),
      submissions: parseInt(submissions.rows[0].count),
    };
  });
  
  console.log('\n Migration verification:');
  console.log(`  File store users: ${fileData.users.length}, PostgreSQL: ${counts.users}`);
  console.log(`  File store programs: ${fileData.programs.length}, PostgreSQL: ${counts.programs}`);
  console.log(`  File store instruments: ${fileData.instruments.length}, PostgreSQL: ${counts.instruments}`);
  console.log(`  File store submissions: ${fileData.submissions.length}, PostgreSQL: ${counts.submissions}`);
  
  const allMatch = 
    fileData.users.length === counts.users &&
    fileData.programs.length === counts.programs &&
    fileData.instruments.length === counts.instruments &&
    fileData.submissions.length === counts.submissions;
  
  if (allMatch) {
    console.log('\n✓ All records migrated successfully!');
  } else {
    console.log('\n⚠ Some records may not have migrated. Please check.');
  }
  
  return counts;
}

module.exports = {
  loadFileStore,
  migrateFromFileStore,
  verifyMigration,
};
