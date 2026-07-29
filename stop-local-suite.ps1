$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidPath = Join-Path $appRoot ".local-runtime/suite-supervisor.pid"
$stopPath = Join-Path $appRoot ".local-runtime/suite.stop"

if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Host "AI-HUB suite is not running."
  exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$supervisorPid = [int](Get-Content -Raw -LiteralPath $pidPath)
try {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$supervisorPid" -ErrorAction Stop
} catch {
  Remove-Item -LiteralPath $pidPath -Force
  Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
  Write-Host "Removed a stale AI-HUB suite PID file."
  exit 0
}

if ($process.ExecutablePath -ne $node -or $process.CommandLine -notmatch "scripts[\\/]local-suite\.mjs") {
  throw "PID file does not identify the AI-HUB suite supervisor."
}
Set-Content -LiteralPath $stopPath -Value "stop" -Encoding Ascii -NoNewline
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline -and (Get-Process -Id $supervisorPid -ErrorAction SilentlyContinue)) {
  Start-Sleep -Milliseconds 200
}
if (Get-Process -Id $supervisorPid -ErrorAction SilentlyContinue) {
  throw "AI-HUB suite did not stop cleanly. Inspect .local-runtime logs before retrying."
}
Remove-Item -LiteralPath $pidPath -Force
Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
Write-Host "AI-HUB suite stopped."
