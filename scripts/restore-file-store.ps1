[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BackupPath,
    [Parameter(Mandatory)]
    [string]$TargetStorePath,
    [Parameter(Mandatory)]
    [ValidateSet('RESTORE FILE STORE')]
    [string]$ConfirmRestore,
    [switch]$AllowOverwrite
)

$ErrorActionPreference = 'Stop'
$backup = [System.IO.Path]::GetFullPath($BackupPath)
$target = [System.IO.Path]::GetFullPath($TargetStorePath)

if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) {
    throw "Restore stopped: backup file does not exist: $backup"
}
if ($backup -eq $target) { throw 'Restore stopped: backup and target paths are identical.' }
if ((Test-Path -LiteralPath $target) -and -not $AllowOverwrite) {
    throw "Restore stopped: target exists. Review it, stop the application, then re-run with -AllowOverwrite."
}

$manifest = "$backup.sha256"
if (Test-Path -LiteralPath $manifest -PathType Leaf) {
    $expected = (Get-Content -LiteralPath $manifest | Where-Object { $_ -like 'sha256=*' } | Select-Object -First 1) -replace '^sha256=', ''
    $actual = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    if ($expected -and $expected -ne $actual) { throw 'Restore stopped: backup checksum does not match its manifest.' }
}

$targetDirectory = Split-Path -Parent $target
New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
Copy-Item -LiteralPath $backup -Destination $target -Force
Write-Output "File store restored to: $target"
