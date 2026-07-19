<#
.SYNOPSIS
  Stop all OpenWhispr dev processes for this project.

.DESCRIPTION
  Targeted shutdown. Kills ONLY processes that either:
    (a) listen on this project's known dev ports, or
    (b) run from an executable inside this project directory.

  It deliberately does NOT do a blanket "kill all node.exe" — that would take
  down unrelated dev servers. Nothing outside D:\ClaudeCode\open-whispr is touched.

  Ports:
    5183  Vite dev server (renderer)
    6006  sherpa-onnx parakeet-ws (STT)
    6333  Qdrant (semantic search sidecar)
    8080  llama.cpp server (local cleanup LLM), if running

  Normally the Electron app cleans up its own sidecars on quit (sidecarRegistry).
  This script is for the case where dev processes are orphaned — e.g. after the
  `concurrently` bug, or a hard kill of the main process.

.EXAMPLE
  powershell -NoProfile -File scripts\whispr-stop.ps1
  powershell -NoProfile -File scripts\whispr-stop.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'SilentlyContinue'

$projectRoot = Split-Path -Parent $PSScriptRoot
$ports       = @(5183, 6006, 6333, 8080)
$killed      = @()

function Stop-WhisprProcess {
    param($Proc, [string]$Reason)

    if (-not $Proc) { return }
    # Never take down this PowerShell session or its parent shell.
    if ($Proc.Id -eq $PID) { return }

    $desc = "$($Proc.ProcessName) (PID $($Proc.Id)) - $Reason"
    if ($PSCmdlet.ShouldProcess($desc, 'Stop-Process')) {
        Stop-Process -Id $Proc.Id -Force
        $script:killed += $desc
        Write-Host "  stopped: $desc" -ForegroundColor Yellow
    }
}

Write-Host "OpenWhispr - stopping dev processes" -ForegroundColor Cyan
Write-Host "Project root: $projectRoot`n"

# 1. By port -------------------------------------------------------------
Write-Host "Checking dev ports..."
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen
    foreach ($conn in $conns) {
        $proc = Get-Process -Id $conn.OwningProcess
        Stop-WhisprProcess -Proc $proc -Reason "listening on :$port"
    }
}

# 2. By executable path inside the project -------------------------------
# Catches Electron plus the bundled sidecar binaries in resources\bin,
# regardless of whether they are currently bound to a port.
Write-Host "Checking processes running from the project directory..."
$names = @(
    'electron',
    'OpenWhispr',
    'sherpa-onnx-ws-win32-x64',
    'sherpa-onnx-online-ws-win32-x64',
    'qdrant-win32-x64',
    'llama-server',
    'windows-key-listener',
    'windows-mic-listener',
    'windows-text-monitor',
    'meeting-aec-helper-win32-x64'
)

foreach ($name in $names) {
    $procs = Get-Process -Name $name
    foreach ($proc in $procs) {
        $path = $proc.Path
        # Only kill it if it actually lives under this project.
        if ($path -and $path.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Stop-WhisprProcess -Proc $proc -Reason "running from project dir"
        }
        elseif ($path) {
            Write-Host "  skipped: $($proc.ProcessName) (PID $($proc.Id)) - outside project ($path)" -ForegroundColor DarkGray
        }
    }
}

# 3. Report --------------------------------------------------------------
Write-Host ""
if ($killed.Count -eq 0) {
    Write-Host "Nothing to stop - no OpenWhispr dev processes were running." -ForegroundColor Green
}
else {
    Write-Host "Stopped $($killed.Count) process(es)." -ForegroundColor Green
}

# Verify the ports are actually free again.
$stillUp = @()
foreach ($port in $ports) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen) { $stillUp += $port }
}
if ($stillUp.Count -gt 0) {
    Write-Warning "Ports still in use: $($stillUp -join ', '). Something outside this project may own them."
    exit 1
}

Write-Host "All OpenWhispr dev ports are free." -ForegroundColor Green
