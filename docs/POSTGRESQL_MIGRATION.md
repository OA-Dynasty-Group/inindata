# PostgreSQL Migration Guide

This guide walks through migrating the Fieldwork application from file-based JSON storage to PostgreSQL for production use.

**Status**: Ready to implement  
**Timeline**: ~2 hours total setup + migration

---

## Prerequisites

### 1. PostgreSQL Installation

#### macOS (Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

#### Windows
- Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- Run installer (use default settings)
- Keep track of the superuser password

#### Docker
```bash
docker run -d \
  --name fieldwork-postgres \
  -e POSTGRES_DB=fieldwork \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:5432:5432 \
  postgres:15-alpine
```

### 2. Create Database & User

Connect to PostgreSQL:
```bash
# macOS/Linux
psql -U postgres

# Windows (in Command Prompt)
psql -U postgres
```

Then run:
```sql
-- Create database
CREATE DATABASE fieldwork OWNER postgres;

-- Create application user (optional but recommended)
CREATE USER fieldwork_user WITH PASSWORD 'your-secure-password';
GRANT CONNECT ON DATABASE fieldwork TO fieldwork_user;

-- Exit
\q
```

---

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

This adds:
- `pg` - PostgreSQL client
- `pg-pool` - Connection pooling

### Step 2: Set Environment Variable

The application reads the database URL from `DATABASE_URL` environment variable.

#### Option A: Create `.env` file (development)
```bash
# .env
DATABASE_URL=postgresql://postgres@localhost:5432/fieldwork
```

#### Option B: Export variable (production)

macOS/Linux:
```bash
export DATABASE_URL="postgresql://fieldwork_user:your-secure-password@localhost:5432/fieldwork"
```

Windows PowerShell:
```powershell
$env:DATABASE_URL = "postgresql://fieldwork_user:your-secure-password@localhost:5432/fieldwork"
```

Windows Command Prompt:
```cmd
set DATABASE_URL=postgresql://fieldwork_user:your-secure-password@localhost:5432/fieldwork
```

### Step 3: Run Database Schema

Apply the initial schema to PostgreSQL:

```bash
# macOS/Linux
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_initial_schema.sql

# Windows PowerShell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/001_initial_schema.sql

# Windows Command Prompt
psql %DATABASE_URL% -v ON_ERROR_STOP=1 -f db/001_initial_schema.sql
```

**Success output:**
```
CREATE SCHEMA
CREATE FUNCTION
... (many more lines)
COMMIT
```

### Step 4: Create Migration Script

Create `migrate-to-postgres.js` in your project root:

```javascript
// migrate-to-postgres.js
const { migrateFromFileStore, verifyMigration } = require('./db/migrate');
const pool = require('./db/pool');

async function main() {
  try {
    const ORG_ID = process.env.ORG_ID || 'org-community-reach';
    
    console.log(`\nMigrating data to PostgreSQL (org: ${ORG_ID})...\n`);
    
    const counts = await migrateFromFileStore(ORG_ID);
    
    console.log('\nMigration summary:');
    console.log(`  Users: ${counts.users}`);
    console.log(`  Programs: ${counts.programs}`);
    console.log(`  Instruments: ${counts.instruments}`);
    console.log(`  Submissions: ${counts.submissions}`);
    console.log(`  Audit logs: ${counts.auditLogs}`);
    
    await verifyMigration(ORG_ID);
    
    await pool.close();
    console.log('\n✓ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

main();
```

### Step 5: Run Migration

```bash
# Make sure server.js has run at least once to generate data/store.json
node server.js
# Wait 2 seconds, then Ctrl+C

# Now migrate
node migrate-to-postgres.js
```

**Expected output:**
```
Migrating data to PostgreSQL (org: org-community-reach)...

Starting migration from file store to PostgreSQL...
Migrating organization...
Migrating 1 users...
Creating default roles...
Assigning roles to users...
Migrating 1 programs...
Migrating 0 instruments...
Migrating 0 submissions...
Migrating 0 audit events...
✓ Migration complete! Data successfully migrated to PostgreSQL.

Migration verification:
  File store users: 1, PostgreSQL: 1
  File store programs: 1, PostgreSQL: 1
  File store instruments: 0, PostgreSQL: 0
  File store submissions: 0, PostgreSQL: 0

✓ All records migrated successfully!
```

### Step 6: Verify PostgreSQL Connection

```bash
# Test connection
node -e "const p = require('./db/pool'); p.health().then(ok => { console.log(ok ? '✓ Connected' : '✗ Failed'); process.exit(ok ? 0 : 1); })"
```

---

## Connection String Format

```
postgresql://[user[:password]@][host][:port][/database][?param1=value1&...]
```

### Examples

**Local (default user)**
```
postgresql://localhost/fieldwork
```

**Local (with password)**
```
postgresql://fieldwork_user:password@localhost/fieldwork
```

**Docker**
```
postgresql://postgres:postgres@localhost:5432/fieldwork
```

**AWS RDS**
```
postgresql://user:password@fieldwork.c12345.us-east-1.rds.amazonaws.com:5432/fieldwork
```

**Azure Database**
```
postgresql://user@servername:password@servername.postgres.database.azure.com:5432/fieldwork
```

**Heroku**
```
postgresql://user:password@ec2-00-00-00-00.compute-1.amazonaws.com:5432/database
```

---

## Post-Migration Checklist

- [ ] Ran `npm install` (installed pg & pg-pool)
- [ ] Set `DATABASE_URL` environment variable
- [ ] Ran schema: `psql "$DATABASE_URL" -f db/001_initial_schema.sql`
- [ ] Created `migrate-to-postgres.js`
- [ ] Ran migration: `node migrate-to-postgres.js`
- [ ] Verified connection works
- [ ] All records migrated (users, programs, etc.)
- [ ] Application starts without errors

---

## Running the Application with PostgreSQL

Once migration is complete:

```bash
export DATABASE_URL="postgresql://..."
node server.js
```

The application will now:
- Connect to PostgreSQL on startup
- Use connection pooling for performance
- Maintain all existing functionality
- Support multiple instances (load balancing ready)

---

## Troubleshooting

### "Connection refused"
**Problem**: Cannot connect to PostgreSQL  
**Solution**:
- Verify PostgreSQL is running: `psql -U postgres -c "SELECT 1"`
- Check `DATABASE_URL` is correct
- Verify firewall allows port 5432

### "Database does not exist"
**Problem**: Schema not applied  
**Solution**:
```bash
psql $DATABASE_URL -f db/001_initial_schema.sql
```

### "Permission denied"
**Problem**: User doesn't have access  
**Solution**:
```sql
GRANT ALL PRIVILEGES ON SCHEMA fieldwork TO fieldwork_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA fieldwork TO fieldwork_user;
GRANT USAGE, CREATE ON SCHEMA fieldwork TO fieldwork_user;
```

### "Migration failed - data mismatch"
**Problem**: Not all records migrated  
**Solution**:
1. Verify `data/store.json` exists
2. Check PostgreSQL logs: `tail -f /var/log/postgresql/postgresql.log`
3. Re-run migration
4. If still failing, manually check row counts:
```sql
SELECT COUNT(*) FROM fieldwork.users;
SELECT COUNT(*) FROM fieldwork.submissions;
```

### "Application crashes on startup"
**Problem**: Server can't connect to database  
**Solution**:
- Verify `DATABASE_URL` is set
- Test connection: `psql "$DATABASE_URL" -c "SELECT 1"`
- Check server logs for detailed error

---

## Backup Before Migration

**IMPORTANT**: Always backup before migration!

### File Store Backup
```bash
cp -r data data.backup  # macOS/Linux
xcopy data data.backup /E /I /Y  # Windows Command Prompt
Copy-Item -Recurse data data.backup  # Windows PowerShell
```

### PostgreSQL Backup
```bash
# Full backup
pg_dump "$DATABASE_URL" > fieldwork-backup.sql

# Test restore (do NOT run on production!)
createdb fieldwork_test
psql fieldwork_test < fieldwork-backup.sql
dropdb fieldwork_test
```

---

## Rollback Plan

If migration fails or you need to rollback:

### Option 1: Restore from backup
```bash
# Stop application
# Drop database
dropdb fieldwork

# Recreate
createdb fieldwork
psql fieldwork -f db/001_initial_schema.sql

# Restore data
psql fieldwork < fieldwork-backup.sql
```

### Option 2: Use file store
```bash
# Unset DATABASE_URL
unset DATABASE_URL

# Restart application
node server.js
# Will use data/store.json (file store)
```

---

## Performance Tuning

### Connection Pool Settings

Edit `db/pool.js`:

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Max connections (↑ for load, ↓ for memory)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Database Indexes

Indexes are already created in schema for:
- `users.email`
- `auth_sessions.token_hash`
- `instruments.organization_id, status`
- `submissions.instrument_id`
- `audit_events.organization_id`

### Monitoring

Query performance:
```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries >1s

-- Check query stats
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

---

## Production Deployment

### Environment Variables

Set these in production:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/fieldwork

# Application
FIELDWORK_PORT=3000
FIELDWORK_BOOTSTRAP_PASSWORD=your-random-secret

# Security
NODE_ENV=production
```

### Health Check

Application provides health endpoint:
```bash
curl http://localhost:3000/api/health
# Response: {"status":"ok"}
```

### Monitoring Connections

```sql
-- Check active connections
SELECT datname, usename, application_name, state 
FROM pg_stat_activity 
WHERE datname = 'fieldwork';

-- Kill idle connections if needed
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'fieldwork' 
  AND state = 'idle' 
  AND query_start < now() - interval '30 minutes';
```

---

## Next Steps

After successful PostgreSQL migration:

1. ✅ Run full test suite: `npm test`
2. ✅ Test in staging environment
3. ✅ Update deployment documentation
4. ✅ Brief team on database changes
5. ✅ Deploy to production
6. ✅ Monitor logs for first 24 hours
7. ✅ Keep file store backups for 30 days

---

## Support

**Common questions:**

**Q: Can I use PostgreSQL without migrating file store data?**  
A: Yes, but you lose existing data. Start with a clean database.

**Q: How do I switch back to file store?**  
A: Unset `DATABASE_URL` and restart application.

**Q: What about multi-instance deployments?**  
A: PostgreSQL enables horizontal scaling. Load balance across multiple instances.

**Q: Do I need to change code?**  
A: No. Server.js will auto-detect `DATABASE_URL` and use PostgreSQL when set.

**Q: How large can the database grow?**  
A: PostgreSQL handles millions of records efficiently. No practical limit.

---

**Migration ready? Start with Step 1: PostgreSQL Installation** ✓
