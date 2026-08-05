param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $appRoot "start-local-suite.ps1") -NoBrowser:$NoBrowser
exit $LASTEXITCODE
