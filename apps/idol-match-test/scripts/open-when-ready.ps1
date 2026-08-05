param(
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DefaultPort = 3220
$PortFile = Join-Path $ProjectRoot "dev-server.port"
$PidFile = Join-Path $ProjectRoot "dev-server.pid"
$OutLog = Join-Path $ProjectRoot "dev-server.out.log"
$ErrLog = Join-Path $ProjectRoot "dev-server.err.log"

function New-LocalUrl {
  param([int]$Port)

  return "http://127.0.0.1:$Port"
}

function Test-LocalUrl {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Get-CurrentPort {
  if (Test-Path -LiteralPath $PortFile) {
    $rawPort = (Get-Content -Raw -LiteralPath $PortFile).Trim()
    if ($rawPort -match '^\d+$') {
      return [int]$rawPort
    }
  }

  return $DefaultPort
}

function Test-ServerProcessAlive {
  if (-not (Test-Path -LiteralPath $PidFile)) {
    return $true
  }

  $rawPid = (Get-Content -Raw -LiteralPath $PidFile).Trim()
  if ($rawPid -notmatch '^\d+$') {
    return $true
  }

  return $null -ne (Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue)
}

function Show-StartupDiagnostics {
  Write-Host "Check logs in:"
  Write-Host "  $OutLog"
  Write-Host "  $ErrLog"

  if (Test-Path -LiteralPath $ErrLog) {
    $errorTail = Get-Content -Tail 20 -LiteralPath $ErrLog -ErrorAction SilentlyContinue
    if ($errorTail) {
      Write-Host ""
      Write-Host "Recent error log:"
      $errorTail | ForEach-Object { Write-Host "  $_" }
    }
  }
}

function Start-IdolMatchServer {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Could not find npm. Please install Node.js or open this file from a terminal where npm works."
    exit 1
  }

  Write-Host "Starting idol match test server..."
  npm run dev:detached | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm could not start the local server."
    Show-StartupDiagnostics
    exit $LASTEXITCODE
  }
}

function Open-LocalUrl {
  param([string]$Url)

  try {
    Start-Process $Url
    return $true
  } catch {
    try {
      Start-Process -FilePath $env:ComSpec -ArgumentList @("/c", "start", '""', $Url) -WindowStyle Hidden
      return $true
    } catch {
      return $false
    }
  }
}

Set-Location -LiteralPath $ProjectRoot

$port = Get-CurrentPort
$url = New-LocalUrl -Port $port

if (-not (Test-LocalUrl -Url $url)) {
  Start-IdolMatchServer
  Start-Sleep -Milliseconds 1000
  $port = Get-CurrentPort
  $url = New-LocalUrl -Port $port
}

$ready = $false
for ($attempt = 1; $attempt -le 120; $attempt++) {
  if (Test-LocalUrl -Url $url) {
    $ready = $true
    break
  }

  if ($attempt -gt 4 -and -not (Test-ServerProcessAlive)) {
    Write-Host "The local server process exited before the page became available."
    Show-StartupDiagnostics
    exit 1
  }

  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Write-Host "Could not reach $url yet."
  Show-StartupDiagnostics
  exit 1
}

Write-Host "Idol match test is ready: $url"
if (-not $NoOpen) {
  if (-not (Open-LocalUrl -Url $url)) {
    Write-Host "Could not open the browser automatically. Copy this address into your browser:"
    Write-Host "  $url"
    exit 1
  }
}

if (Test-Path -LiteralPath $PidFile) {
  Write-Host "Server pid: $((Get-Content -Raw -LiteralPath $PidFile).Trim())"
}
