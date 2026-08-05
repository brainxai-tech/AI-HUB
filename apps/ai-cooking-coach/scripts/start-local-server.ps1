param(
  [int]$Port = 4317,
  [int]$MonitorIntervalSeconds = 10
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AppUrl = "http://127.0.0.1:$Port"
$HealthUrl = "http://127.0.0.1:$Port/api/health"
$PidPath = Join-Path $ProjectRoot "dev-server.pid"

function Test-LocalHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Repair-PathEnvironment {
  $pathValue = [Environment]::GetEnvironmentVariable("Path", "Process")
  if (-not $pathValue) {
    $pathValue = [Environment]::GetEnvironmentVariable("PATH", "Process")
  }

  Remove-Item Env:\PATH -ErrorAction SilentlyContinue

  if ($pathValue) {
    [Environment]::SetEnvironmentVariable("Path", $pathValue, "Process")
  }
}

function Get-NodePath {
  $bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $bundledNode) {
    return $bundledNode
  }

  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    return $nodeCommand.Source
  }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    return $nodeCommand.Source
  }

  throw "Node.js was not found. Please install Node.js 20+ or run this from the Codex desktop environment."
}

function Watch-LocalServer {
  Write-Host "AI Cooking Coach is running at $AppUrl"
  Write-Host "Keep this cmd window open while generating cooking plans."
  Write-Host "Press Ctrl+C or close this window when you are finished."

  while ($true) {
    Start-Sleep -Seconds $MonitorIntervalSeconds
    if (-not (Test-LocalHealth)) {
      Write-Host "AI Cooking Coach is no longer responding at $HealthUrl"
      exit 1
    }
  }
}

function Open-LocalApp {
  try {
    Write-Host "Opening AI Cooking Coach in your browser..."
    Start-Process $AppUrl -ErrorAction Stop
  } catch {
    Write-Host "Could not open the browser automatically."
    Write-Host "Open this URL manually: $AppUrl"
  }
}

function Wait-ForLocalHealth {
  param(
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalHealth) {
      return $true
    }

    if ($Process -and $Process.HasExited) {
      return $false
    }

    Start-Sleep -Milliseconds 700
  }

  return $false
}

Repair-PathEnvironment

if (Test-LocalHealth) {
  Write-Host "AI Cooking Coach is already running at $HealthUrl"
  Open-LocalApp
  Watch-LocalServer
}

$nodePath = Get-NodePath

$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $nodePath
$processInfo.Arguments = "server.mjs"
$processInfo.WorkingDirectory = $ProjectRoot
$processInfo.UseShellExecute = $false
$processInfo.EnvironmentVariables["PORT"] = [string]$Port

$process = [System.Diagnostics.Process]::Start($processInfo)
$process.Id | Set-Content -Path $PidPath -Encoding ASCII

if (Wait-ForLocalHealth -Process $process) {
  Open-LocalApp
} elseif ($process.HasExited) {
  Write-Host "AI Cooking Coach failed to start."
  exit $process.ExitCode
} else {
  Write-Host "AI Cooking Coach did not answer health checks within 30 seconds."
  Write-Host "Open this URL manually after the server finishes starting: $AppUrl"
}

$process.WaitForExit()
exit $process.ExitCode
