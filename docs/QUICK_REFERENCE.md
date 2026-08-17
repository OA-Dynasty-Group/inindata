# Quick Reference — Common Operations

## Development Environment

### Start the server
```bash
node server.js
# Or with custom port:
FIELDWORK_PORT=3001 node server.js
```

### Stop the server
```bash
# Ctrl+C in terminal where server is running
```

### Run tests
```bash
npm test
```

### Reset development data
```bash
rm data/store.json  # macOS/Linux
del data/store.json # Windows Command Prompt
Remove-Item data/store.json -Force  # Windows PowerShell
```

### Check API health
```bash
curl http://localhost:3000/api/health
```

---

## User Management

### Create a new user (via API)
```bash
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "password": "SecurePassword123456",
    "role": "program_manager"
  }'
```

### Change user status
```bash
curl -X PATCH http://localhost:3000/api/users/{USER_ID}/status \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{"status": "suspended"}'
```

### List all users
```bash
curl http://localhost:3000/api/users \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

---

## Form Management

### Create a new form
```bash
curl -X POST http://localhost:3000/api/instruments \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{"name": "Community Survey 2026"}'
```

### List all forms
```bash
curl http://localhost:3000/api/instruments \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

### Get form definition
```bash
curl http://localhost:3000/api/instruments/{INSTRUMENT_ID} \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

### Update form (draft only)
```bash
curl -X PUT http://localhost:3000/api/instruments/{INSTRUMENT_ID} \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{
    "name": "Updated Form Name",
    "sections": [...]
  }'
```

### Publish form
```bash
curl -X POST http://localhost:3000/api/instruments/{INSTRUMENT_ID}/publish \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

---

## Data Collection

### Get public form (no authentication needed)
```bash
curl http://localhost:3000/api/collect/{COLLECTION_TOKEN}
```

### Submit a response
```bash
curl -X POST http://localhost:3000/api/collect/{COLLECTION_TOKEN}/submissions \
  -H 'Content-Type: application/json' \
  -d '{
    "answers": {
      "full_name": "Sam Johnson",
      "community": "Harbour View",
      "household_size": 4
    }
  }'
```

### Access collection form in browser
```
http://localhost:3000/collect/{COLLECTION_TOKEN}
```

---

## Response Management

### List responses for a form
```bash
curl http://localhost:3000/api/instruments/{INSTRUMENT_ID}/submissions \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

### Review/approve a response
```bash
curl -X POST http://localhost:3000/api/submissions/{SUBMISSION_ID}/review \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{"status": "approved"}'
```

### Workflow statuses
- `submitted` → `approved` → `locked`
- `submitted` → `rejected` (terminal)

---

## Data Operations

### Get dataset structure
```bash
curl http://localhost:3000/api/instruments/{INSTRUMENT_ID}/dataset \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

### Export dataset as CSV
```bash
curl http://localhost:3000/api/instruments/{INSTRUMENT_ID}/dataset/export \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -o responses.csv
```

### Preview CSV import
```bash
curl -X POST http://localhost:3000/api/instruments/{INSTRUMENT_ID}/dataset/import/preview \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{"csv": "Name,Age\nJohn,25"}'
```

### Import CSV data
```bash
curl -X POST http://localhost:3000/api/instruments/{INSTRUMENT_ID}/dataset/import \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{"csv": "Name,Age\nJohn,25\nJane,30"}'
```

---

## Analytics & Reporting

### Get analytics for a field
```bash
curl 'http://localhost:3000/api/instruments/{INSTRUMENT_ID}/analytics?dimension=community' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

### Create a dashboard
```bash
curl -X POST http://localhost:3000/api/dashboards \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{
    "name": "Community Needs Summary",
    "instrumentId": "{INSTRUMENT_ID}",
    "dimension": "community"
  }'
```

### Create a report
```bash
curl -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{
    "title": "Q3 2026 Findings",
    "instrumentId": "{INSTRUMENT_ID}",
    "dimension": "community",
    "narrative": "Summary of key findings..."
  }'
```

---

## Program Management

### Create a program
```bash
curl -X POST http://localhost:3000/api/programs \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{
    "name": "Youth Employment 2026",
    "code": "YE-2026",
    "description": "Supporting young people..."
  }'
```

### Add a project to a program
```bash
curl -X POST http://localhost:3000/api/programs/{PROGRAM_ID}/projects \
  -H 'Content-Type: application/json' \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN' \
  -d '{"name": "Skills Training Initiative"}'
```

### List programs
```bash
curl http://localhost:3000/api/programs \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

---

## Audit & Logging

### View audit trail
```bash
curl http://localhost:3000/api/audit-logs \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

Logged events include:
- User creation/deletion/status changes
- Form creation/publication/updates
- Data imports/exports
- Submissions and reviews
- Dashboard/report creation

---

## Authentication

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@communityreach.local",
    "password": "change-me-now"
  }'
# Returns: {"user": {...}} and sets fieldwork_session cookie
```

### Get current user
```bash
curl http://localhost:3000/api/me \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

### Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H 'Cookie: fieldwork_session=YOUR_TOKEN'
```

---

## Role-Based Permissions

### Available Roles
- `organization_admin` — Full access
- `program_manager` — Manage programs, instruments, submissions
- `reviewer` — Review and approve responses
- `analyst` — View analytics and export data
- `field_worker` — Collect responses only

### Permission Mapping
```
user:read          → View users
user:write         → Create/manage users
program:read       → View programs
program:write      → Create programs & projects
instrument:read    → View forms
instrument:write   → Edit forms
instrument:publish → Publish forms
submission:review  → Review responses
dataset:import     → Import data
dataset:export     → Export data
analytics:read     → View analytics
dashboard:read     → View dashboards
dashboard:write    → Create dashboards
report:read        → View reports
report:write       → Create reports
audit:read         → View audit log
```

---

## Troubleshooting Commands

### Check if server is running
```bash
curl -v http://localhost:3000/api/health
```

### View server logs (production)
```bash
# Linux/macOS
tail -f /var/log/fieldwork.log

# Windows
Get-Content C:\fieldwork\logs\app.log -Tail 100 -Wait
```

### Kill process on port 3000
```bash
# macOS/Linux
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Windows PowerShell
netstat -ano | findstr :3000 | ForEach-Object {
  $pid = $_.Split()[4]; taskkill /PID $pid /F
}
```

### Test production server
```bash
curl -k https://fieldwork.example.com/api/health
```

### Extract session token from login response
```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@communityreach.local","password":"change-me-now"}' | \
  grep -o '"user"' | head -1
```

---

## Common Workflows

### Complete data collection workflow

1. **Create form**
   ```bash
   curl -X POST http://localhost:3000/api/instruments \
     -H 'Content-Type: application/json' \
     -d '{"name": "Community Needs"}'
   ```

2. **Add questions** (via UI or API)

3. **Publish form**
   ```bash
   curl -X POST http://localhost:3000/api/instruments/{ID}/publish
   ```

4. **Share collection link**
   - Get token from publish response
   - Share: `http://localhost:3000/collect/{TOKEN}`

5. **Review responses**
   ```bash
   curl http://localhost:3000/api/instruments/{ID}/submissions
   ```

6. **Analyze data**
   ```bash
   curl 'http://localhost:3000/api/instruments/{ID}/analytics?dimension=community'
   ```

---

## Environment Variables

```bash
# Port (default: 3000)
FIELDWORK_PORT=3001

# Bootstrap password (set before first start)
FIELDWORK_BOOTSTRAP_PASSWORD=my-secure-password

# Database URL (for PostgreSQL migration)
DATABASE_URL=postgresql://user:pass@localhost/fieldwork
```

---

## Useful Command Aliases

Add to `.bashrc` or `.zshrc` for quick access:

```bash
alias fieldwork-start='cd /path/to/inindata && node server.js'
alias fieldwork-test='cd /path/to/inindata && npm test'
alias fieldwork-logs='tail -f /var/log/fieldwork.log'
alias fieldwork-health='curl -s http://localhost:3000/api/health | jq'
```

---

## See Also

- [DEVELOPMENT.md](DEVELOPMENT.md) — Full development guide
- [DEPLOYMENT.md](DEPLOYMENT.md) — Production deployment
- [Functional Specification.md](Functional%20Specification.md) — Feature details
