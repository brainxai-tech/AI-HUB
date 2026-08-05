param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $appRoot ".local-runtime"
$pidPath = Join-Path $runtimeDir "suite-supervisor.pid"
$stopPath = Join-Path $runtimeDir "suite.stop"
$hubUrl = "http://127.0.0.1:4194/hub/"
$readyUrls = @(
  "http://127.0.0.1:4194/hub/api/health",
  "http://127.0.0.1:4195/health",
  "http://127.0.0.1:4196/health",
  "http://127.0.0.1:4201/ppt-report-coach/api/providers",
  "http://127.0.0.1:4202/work-report/api/providers",
  "http://127.0.0.1:4203/mbti/api/providers",
  "http://127.0.0.1:4204/essay/api/providers",
  "http://127.0.0.1:4205/poetry/api/providers",
  "http://127.0.0.1:4211/xiangqi/",
  "http://127.0.0.1:4212/chess/",
  "http://127.0.0.1:4213/go/",
  "http://127.0.0.1:4194/fury-flock/",
  "http://127.0.0.1:4194/hub/dice-estate/"
)

function Test-SuiteReady {
  foreach ($url in $readyUrls) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
      if ($response.StatusCode -ne 200) { return $false }
    } catch {
      return $false
    }
  }
  return $true
}

if (Test-SuiteReady) {
  if (-not $NoBrowser) { Start-Process $hubUrl }
  Write-Host "AI-HUB suite is already running: $hubUrl"
  exit 0
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$node = (Get-Command node -ErrorAction Stop).Source

if (Test-Path -LiteralPath $pidPath) {
  $previousPid = $null
  try {
    $previousPid = [int](Get-Content -Raw -LiteralPath $pidPath)
    $previousProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$previousPid" -ErrorAction Stop
    if ($previousProcess.ExecutablePath -eq $node -and $previousProcess.CommandLine -match "scripts[\\/]local-suite\.mjs") {
      Set-Content -LiteralPath $stopPath -Value "stop" -Encoding Ascii -NoNewline
      $stopDeadline = (Get-Date).AddSeconds(15)
      while ((Get-Date) -lt $stopDeadline -and (Get-Process -Id $previousPid -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 200
      }
      if (Get-Process -Id $previousPid -ErrorAction SilentlyContinue) {
        throw "The previous AI-HUB suite did not stop cleanly. Run .\stop-local-suite.ps1 and inspect .local-runtime logs."
      }
    }
  } catch {
    if ($previousPid -and (Get-Process -Id $previousPid -ErrorAction SilentlyContinue)) { throw }
    # A stale PID is harmless; startup below reports any real port conflict.
  }
}

Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue

& $node "scripts/workspace-tasks.mjs" "check"
if ($LASTEXITCODE -ne 0) {
  throw "Workspace builds are missing. Run npm run workspace:install and npm run workspace:build first."
}

$supervisor = Start-Process `
  -WindowStyle Hidden `
  -FilePath $node `
  -ArgumentList "scripts/local-suite.mjs" `
  -WorkingDirectory $appRoot `
  -RedirectStandardOutput (Join-Path $runtimeDir "suite.out.log") `
  -RedirectStandardError (Join-Path $runtimeDir "suite.err.log") `
  -PassThru

Set-Content -LiteralPath $pidPath -Value $supervisor.Id -Encoding Ascii -NoNewline

$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  if ($supervisor.HasExited) {
    throw "AI-HUB suite stopped during startup. Check .local-runtime/suite.err.log."
  }
  if (Test-SuiteReady) {
    if (-not $NoBrowser) { Start-Process $hubUrl }
    Write-Host "AI-HUB suite is ready: $hubUrl"
    exit 0
  }
  Start-Sleep -Milliseconds 350
}

if (-not $supervisor.HasExited) { Stop-Process -Id $supervisor.Id -Force -ErrorAction SilentlyContinue }
throw "AI-HUB suite timed out. Check .local-runtime/suite.err.log."
