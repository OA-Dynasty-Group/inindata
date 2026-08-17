# PostgreSQL schema

`001_initial_schema.sql` is the production persistence foundation for Fieldwork. It creates a separate `fieldwork` schema and is safe to run once against an empty database on PostgreSQL 15 or later.

Run it with:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/001_initial_schema.sql
```

The application database role should have normal DML rights on `fieldwork`, but audit records should be inserted only through application audit code. The migration makes `audit_events` immutable at the database layer: updates and deletes raise an exception. For stronger separation, grant the runtime role `INSERT, SELECT` only on that table and use a migration/admin role for schema changes.

Design notes:

- Every business record is scoped to an organization; APIs should always filter by the authenticated organization and `deleted_at IS NULL`.
- Definitions and collected answers are JSONB because the form schema is dynamic. Published `instrument_versions` are immutable by convention and submissions retain the exact version used.
- Collection links store a digest, not the public bearer token. Session tokens are also stored as hashes.
- `datasets` supports imported or curated records alongside instrument-derived submissions. An import may use `external_id` for idempotency.
- `reports` and `dashboards` store versionable configuration documents in JSONB. Add explicit version tables if report/dashboard publishing becomes a formal workflow.
- Application code must verify cross-table organization ownership (for example, that a project belongs to the submitted instrument's organization); PostgreSQL foreign keys do not enforce that multi-column tenancy rule by themselves.
- Use new, ordered migration files for future changes. Do not edit an applied migration.
