[CmdletBinding()]
param(
    [string]$StorePath = (Join-Path $PSScriptRoot '..\data\store.json'),
    [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\backups\file-store')
)

$ErrorActionPreference = 'Stop'
$source = [System.IO.Path]::GetFullPath($StorePath)
$destinationDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "File-store backup stopped: source file does not exist: $source"
}

New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $destinationDirectory "store-$timestamp.json"
$manifest = "$backup.sha256"

Copy-Item -LiteralPath $source -Destination $backup -ErrorAction Stop
$hash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
@(
    "sha256=$hash"
    "source=$source"
    "created_utc=$((Get-Date).ToUniversalTime().ToString('o'))"
) | Set-Content -LiteralPath $manifest -Encoding utf8NoBOM

Write-Output "Backup created: $backup"
Write-Output "Checksum manifest: $manifest"
