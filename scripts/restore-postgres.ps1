[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BackupPath,
    [Parameter(Mandatory)]
    [string]$TargetDatabaseUrl,
    [Parameter(Mandatory)]
    [ValidateSet('RESTORE POSTGRES')]
    [string]$ConfirmRestore,
    [switch]$AllowDestructiveRestore,
    [string]$PgRestorePath = 'pg_restore'
)

$ErrorActionPreference = 'Stop'
$backup = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) { throw "Restore stopped: backup file does not exist: $backup" }
if (-not (Get-Command $PgRestorePath -ErrorAction SilentlyContinue)) {
    throw "PostgreSQL restore stopped: '$PgRestorePath' was not found. Install PostgreSQL client tools or supply -PgRestorePath."
}

$manifest = "$backup.sha256"
if (Test-Path -LiteralPath $manifest -PathType Leaf) {
    $expected = (Get-Content -LiteralPath $manifest | Where-Object { $_ -like 'sha256=*' } | Select-Object -First 1) -replace '^sha256=', ''
    $actual = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    if ($expected -and $expected -ne $actual) { throw 'Restore stopped: backup checksum does not match its manifest.' }
}

$arguments = @('--dbname', $TargetDatabaseUrl, '--no-owner', '--no-privileges', '--exit-on-error')
if ($AllowDestructiveRestore) {
    Write-Warning 'Destructive restore enabled: existing objects in the target may be dropped.'
    $arguments += @('--clean', '--if-exists')
}
$arguments += $backup
& $PgRestorePath @arguments
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL restore failed. Inspect pg_restore output before retrying.' }
Write-Output 'PostgreSQL restore completed.'
