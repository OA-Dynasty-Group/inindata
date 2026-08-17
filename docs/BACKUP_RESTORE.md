# Backup and restore runbook

These helpers are intended for operator-run backups. They do not upload archives or schedule jobs. Keep backups in encrypted storage outside the application host, test restores regularly, and restrict access because backups contain sensitive response data.

## File-store development mode

Stop `node server.js` before copying or restoring `data/store.json`. Create a backup:

```powershell
.\scripts\backup-file-store.ps1
```

Each JSON copy has a sidecar SHA-256 manifest. Restore requires an explicit target, confirmation value, and (when the target exists) overwrite acknowledgement:

```powershell
.\scripts\restore-file-store.ps1 -BackupPath .\backups\file-store\store-YYYYMMDD-HHMMSS.json -TargetStorePath .\data\store.json -ConfirmRestore 'RESTORE FILE STORE' -AllowOverwrite
```

Do not restore over a running instance. Take a fresh backup of the target before overwriting it, then start the service and verify sign-in and a read-only API request.

## PostgreSQL

Install PostgreSQL client tools and keep database credentials out of shell history where possible. A custom-format dump preserves enough metadata for `pg_restore`:

```powershell
.\scripts\backup-postgres.ps1 -DatabaseUrl $env:DATABASE_URL
```

Restore first into a newly created, isolated database and validate the data. The standard restore does not drop objects:

```powershell
.\scripts\restore-postgres.ps1 -BackupPath .\backups\postgres\fieldwork-YYYYMMDD-HHMMSS.dump -TargetDatabaseUrl $env:RESTORE_DATABASE_URL -ConfirmRestore 'RESTORE POSTGRES'
```

`-AllowDestructiveRestore` adds `pg_restore --clean --if-exists`; it may delete objects in the specified target database and should only be used after confirming that target and taking a current backup. The scripts intentionally never choose a database, stop an application, or run a destructive restore automatically.

For both stores, retain at least one off-site copy and record the backup time, environment, operator, and a successful restore test in the organization’s operations log.
