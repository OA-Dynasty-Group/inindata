[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$DatabaseUrl,
    [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\backups\postgres'),
    [string]$PgDumpPath = 'pg_dump'
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command $PgDumpPath -ErrorAction SilentlyContinue)) {
    throw "PostgreSQL backup stopped: '$PgDumpPath' was not found. Install PostgreSQL client tools or supply -PgDumpPath."
}

$directory = [System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $directory "fieldwork-$timestamp.dump"

& $PgDumpPath --format=custom --file=$backup --dbname=$DatabaseUrl --no-owner --no-privileges
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup -PathType Leaf)) {
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    throw 'PostgreSQL backup failed; no usable backup was retained by this script.'
}

$hash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
"sha256=$hash" | Set-Content -LiteralPath "$backup.sha256" -Encoding utf8NoBOM
Write-Output "PostgreSQL backup created: $backup"
