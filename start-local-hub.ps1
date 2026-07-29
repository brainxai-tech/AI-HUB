$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $appRoot ".local-runtime"
$localUrl = "http://127.0.0.1:4310/hub/"
$keyConfigUrl = "http://127.0.0.1:4310/hub/key-config/"
$modelConfigUrl = "http://127.0.0.1:4310/hub/api/model-config"
$pidPath = Join-Path $runtimeDir "local-server.pid"

function Test-LocalHubReady {
  try {
    $homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 2
    $keyConfigResponse = Invoke-WebRequest -UseBasicParsing -Uri $keyConfigUrl -TimeoutSec 2
    $modelConfigResponse = Invoke-WebRequest -UseBasicParsing -Uri $modelConfigUrl -TimeoutSec 5
    $modelConfig = $modelConfigResponse.Content | ConvertFrom-Json
    return (
      $homeResponse.StatusCode -eq 200 -and
      $keyConfigResponse.StatusCode -eq 200 -and
      $modelConfigResponse.StatusCode -eq 200 -and
      $modelConfig.localMode -eq $true
    )
  } catch {
    return $false
  }
}

if (Test-LocalHubReady) {
  Start-Process $localUrl
  exit 0
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$node = (Get-Command node -ErrorAction Stop).Source

if (Test-Path $pidPath) {
  try {
    $previousPid = [int](Get-Content -Raw $pidPath)
    $previousProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$previousPid" -ErrorAction Stop
    if ($previousProcess.ExecutablePath -eq $node -and $previousProcess.CommandLine -match "server\.mjs") {
      Stop-Process -Id $previousPid -Force -ErrorAction Stop
      Start-Sleep -Milliseconds 200
    }
  } catch {
    # Ignore a stale PID file; a clear startup error is reported below if the port is occupied.
  }
}

$env:PORT = "4310"
$env:HUB_LOCAL_MODE = "true"
Remove-Item Env:HUB_REMOTE_GATEWAY_ORIGIN -ErrorAction SilentlyContinue
$env:HUB_CONFIG_PATH = Join-Path $runtimeDir "model-config.json"
$env:HUB_PROJECT_MODELS_PATH = Join-Path $runtimeDir "project-model-selections.json"
$env:HUB_OBSERVABILITY_LOG_PATH = Join-Path $runtimeDir "observability-events.jsonl"
$env:HUB_PROJECT_TOKENS_PATH = Join-Path $runtimeDir "project-tokens.json"

$serverProcess = Start-Process `
  -WindowStyle Hidden `
  -FilePath $node `
  -ArgumentList "server.mjs" `
  -WorkingDirectory $appRoot `
  -RedirectStandardOutput (Join-Path $runtimeDir "server.out.log") `
  -RedirectStandardError (Join-Path $runtimeDir "server.err.log") `
  -PassThru

Set-Content -Path $pidPath -Value $serverProcess.Id -Encoding Ascii -NoNewline

for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 200
  if (Test-LocalHubReady) {
    Start-Process $localUrl
    exit 0
  }
}

throw "AI Hub local server timed out. Check .local-runtime/server.err.log."
