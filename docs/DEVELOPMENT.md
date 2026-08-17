# Local Development Guide

This guide covers setting up and running the Fieldwork NGO data platform locally for development and testing.

## System Requirements

- **Node.js**: 18.x or later (tested with Node.js LTS)
- **Operating System**: Windows, macOS, or Linux
- **Disk Space**: Minimal (~50 MB with node_modules)
- **RAM**: 512 MB minimum

## Installation

### 1. Clone or download the project

```bash
cd path/to/inindata
```

### 2. Install dependencies

```bash
npm install
```

This installs:
- `xlsx` (v0.18.5): For Excel/XLSX file parsing

The project intentionally minimizes external dependencies for development simplicity.

## Running the Application

### Start the server

```bash
node server.js
```

Or set a custom port:

```bash
# macOS/Linux
FIELDWORK_PORT=3001 node server.js

# Windows PowerShell
$env:FIELDWORK_PORT = '3001'; node server.js

# Windows Command Prompt
set FIELDWORK_PORT=3001 && node server.js
```

**Default output:**
```
Fieldwork running on http://localhost:3000
```

### Access the application

Open your browser and navigate to:
```
http://localhost:3000
```

## Development Login

**Default administrator credentials** (only for local development):
- **Email**: `admin@communityreach.local`
- **Password**: `change-me-now`

To use a different bootstrap password on first start:

```bash
# macOS/Linux
FIELDWORK_BOOTSTRAP_PASSWORD='my-custom-password' node server.js

# Windows PowerShell
$env:FIELDWORK_BOOTSTRAP_PASSWORD = 'my-custom-password'; node server.js
```

Once `data/store.json` is created, this password is locked in. To reset, delete `data/store.json` and restart.

## Data Storage

### Development store

The application uses a JSON file at `data/store.json` for development:

```json
{
  "organization": { ... },
  "users": [ ... ],
  "programs": [ ... ],
  "instruments": [ ... ],
  "submissions": [ ... ],
  "reports": [ ... ],
  "dashboards": [ ... ],
  "auditLogs": [ ... ]
}
```

### Resetting data

To start fresh with a clean database:

```bash
rm data/store.json      # macOS/Linux
del data/store.json     # Windows Command Prompt
Remove-Item data/store.json -Force  # Windows PowerShell
```

Then restart the server.

## Running Tests

Execute the full test suite:

```bash
npm test
```

**Output example:**
```
✔ the seed definition is valid
✔ definitions reject duplicate internal keys
✔ submissions enforce required fields and select options
... (14 tests total)
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

## API Testing

### Health check

```bash
curl http://localhost:3000/api/health
```

Response: `{"status":"ok"}`

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@communityreach.local",
    "password": "change-me-now"
  }'
```

### List instruments (requires authentication)

```bash
curl -X GET http://localhost:3000/api/instruments \
  -H 'Cookie: fieldwork_session=YOUR_SESSION_TOKEN'
```

## Development Workflow

### 1. Form/Instrument Development

- Navigate to **Forms** tab in the UI
- Click **New form**
- Add sections and questions
- Save automatically every 450ms while editing
- Click **Publish form** when ready

### 2. Data Collection

- Published forms get a unique collection token
- Share the public collection link: `/collect/{token}`
- Respondents can submit responses without authentication

### 3. Response Review

- Navigate to **Responses** tab
- Review submitted responses
- Approve, reject, or lock responses

### 4. Data Analysis

- Go to **Analytics** tab
- Select a field to group responses by
- View bar chart of aggregated data
- Save custom dashboards

### 5. Data Import/Export

- **Import**: Datasets tab → Upload CSV/XLSX
  - Preview matches columns to form fields
  - Validates all rows before import
  - Cannot import rows with validation errors
- **Export**: Datasets tab → Export CSV

## Project Structure

```
inindata/
├── server.js                 # Main HTTP server & API
├── app.js                    # Admin UI client-side logic
├── collect.js                # Public form submission logic
├── index.html                # Admin dashboard
├── collect.html              # Public form page
├── *.css                      # Styling (15+ feature modules)
├── package.json              # Dependencies
├── data/
│   └── store.json            # Development database (generated)
├── db/
│   └── 001_initial_schema.sql # (For future PostgreSQL)
├── test/
│   └── server.test.js        # Unit tests
├── scripts/                  # Backup/restore PowerShell scripts
├── README.md                 # Project overview
├── DEVELOPMENT.md            # This file
├── DEPLOYMENT.md             # Production setup
├── SECURITY.md               # Security considerations
├── BACKUP_RESTORE.md         # Data backup procedures
└── Functional Specification.md
```

## Key Features to Test Locally

### ✅ Authentication
- [ ] Login with dev credentials
- [ ] Unauthorized routes return 401
- [ ] Session cookie works across pages

### ✅ Form Builder
- [ ] Add/edit/delete questions
- [ ] Add/remove sections
- [ ] Conditional logic (show when field equals value)
- [ ] Publish form (creates collection token)

### ✅ Data Collection
- [ ] Public form submission without login
- [ ] Server validates required fields
- [ ] Hidden fields are skipped during validation
- [ ] Submission confirmation page

### ✅ Response Management
- [ ] View submitted responses
- [ ] Approve/reject/lock workflow
- [ ] Cannot change locked responses

### ✅ Data Operations
- [ ] CSV import with validation
- [ ] Export responses as CSV
- [ ] Field search in dataset view

### ✅ Analytics
- [ ] Group by any form field
- [ ] Bar chart updates with selections
- [ ] Save chart as dashboard

### ✅ Administration
- [ ] Create users with different roles
- [ ] Suspend/reactivate users
- [ ] Create programs and projects
- [ ] View audit log of all actions

## Troubleshooting

### Port already in use

```bash
# macOS/Linux: Find and kill process on port 3000
lsof -i :3000
kill -9 <PID>

# Windows: Find and kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Cannot access http://localhost:3000

- Verify the server is running: `Fieldwork running on http://localhost:3000`
- Check that no firewall is blocking port 3000
- Try a different port: `FIELDWORK_PORT=3001 node server.js`

### Data/store.json not created

Ensure the `data/` directory exists and is writable:

```bash
# macOS/Linux
mkdir -p data
chmod 755 data

# Windows PowerShell
New-Item -ItemType Directory -Path data -Force
```

### Tests fail

- Ensure all dependencies are installed: `npm install`
- Use Node.js 18+: `node --version`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### Form not accepting submissions

- Verify the form is **Published** (not in Draft status)
- Check console for validation errors
- Ensure all required fields are visible (not hidden by conditional logic)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `FIELDWORK_PORT` | `3000` | HTTP server listen port |
| `FIELDWORK_BOOTSTRAP_PASSWORD` | `change-me-now` | Admin password (dev only, first start only) |

## Next Steps

- Review [DEPLOYMENT.md](DEPLOYMENT.md) for production setup
- See [SECURITY.md](SECURITY.md) for security considerations
- Check [Functional Specification.md](Functional%20Specification.md) for detailed feature documentation
- Read [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for data protection procedures
