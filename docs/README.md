# Fieldwork — NGO Data Platform MVP

A self-contained, metadata-driven platform for dynamic survey collection, program data management, analytics, reporting, and organizational data governance. Zero-dependency development server with a PostgreSQL-ready architecture.

## ✅ Application Status: Ready for Development & Deployment

All core features implemented and tested. See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup.

## Quick Start

### Prerequisites
- Node.js 18+
- 50 MB disk space

### Local Development (3 commands)

```bash
npm install
node server.js
# Visit http://localhost:3000
```

**Default login:**
- Email: `admin@communityreach.local`
- Password: `change-me-now` (development only)

### Run tests

```bash
npm test  # All 14 tests pass ✓
```

## Documentation

- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** — Feature completion matrix, test results, readiness checklist
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — Complete local setup and development workflow
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Production deployment with reverse proxy & TLS (Docker, Systemd, Windows)
- **[SECURITY.md](SECURITY.md)** — Security architecture and deployment considerations
- **[BACKUP_RESTORE.md](BACKUP_RESTORE.md)** — Data backup and recovery procedures
- **[Functional Specification.md](Functional%20Specification.md)** — Detailed feature documentation

## Architecture

**Current MVP** uses a file-based store at `data/store.json` for rapid development. The data model and API are fully PostgreSQL-compatible.

- **Server**: Node.js HTTP server, ~600 lines, no Express/frameworks
- **Client**: Vanilla JavaScript, ~1000 lines, no build step required
- **Database**: JSON file (development) → PostgreSQL (production-ready in code)
- **Authentication**: Session-based with password hashing (PBKDF2)
- **Permissions**: Role-based access control (5 built-in roles)

Available endpoints:

- `GET /api/instruments`
- `GET` / `PUT /api/instruments/:id`
- `POST /api/instruments/:id/publish`
- `GET /api/collect/:token`
- `POST /api/collect/:token/submissions`
- `GET /api/instruments/:id/submissions`
- `POST /api/submissions/:id/review`
- `GET /api/instruments/:id/dataset`
- `GET /api/instruments/:id/dataset/export`
- `POST /api/instruments/:id/dataset/import/preview`
- `POST /api/instruments/:id/dataset/import`
- `GET /api/instruments/:id/analytics?dimension=:field_key`
- `GET` / `POST /api/programs`
- `POST /api/programs/:id/projects`
- `GET` / `POST /api/reports`
- `GET` / `POST /api/users`
- `PATCH /api/users/:id/status`
- `GET` / `POST /api/instruments`
- `GET` / `POST /api/dashboards`
- `GET /api/audit-logs`

Published collection links are available at `/collect/:token`. Responses start as `submitted`; reviewers with the `submission:review` permission can approve, reject, or lock them. Every state transition is added to the audit log.

The Dataset view derives its columns from the instrument definition and its rows from submitted responses. CSV exports require the explicit `dataset:export` permission and create an `EXPORT` audit event.

CSV imports are previewed and validated before anything is written. The importer matches a CSV heading to either a field’s internal key or its display label, rejects invalid rows without silently dropping data, and creates an `IMPORT` audit event on completion. XLSX import remains the next interoperability increment because it requires a dedicated workbook parser.

The Analytics view uses `analytics:read` permission and can dynamically group a response-count measure by any defined dataset field. The first visualization is a bar chart; more widget types can use the same aggregation endpoint.

Programs and projects provide the organizational context for instruments. Program administration requires `program:read` or `program:write`, and creates an audit event for every program or project created.

The Audit log is limited to `audit:read`. Submission workflow transitions are enforced on the server: `submitted → approved/rejected` and `approved → locked`; locked responses cannot be changed through the normal workflow.

Reports are saved configuration objects. A definition captures the title, dataset dimension, and narrative, validates that the selected dimension remains available, and creates an audit event. PDF rendering is intentionally deferred until a document-rendering adapter is selected.

Questions can now define a visibility rule: show this question only when another field equals a configured value. The public collection interface updates immediately as respondents answer, while the server applies the same rule during validation so hidden required fields are correctly skipped.

User administration requires `user:read` and `user:write`. The initial role templates are Organization Administrator, Program Manager, Reviewer, Data Analyst, and Field Worker; permissions are enforced server-side and account status can be suspended or reactivated. Email invitations and password-reset delivery require an email provider and remain a deployment integration.

The Forms workspace creates draft instruments with an empty configurable section. It deliberately treats every form as an instrument configuration instead of introducing type-specific application flows.

Saved dashboards are configuration objects. The first dashboard widget stores an instrument, a response-count measure, and a grouping dimension; it is validated against the instrument’s dynamic dataset schema and audited on creation.
