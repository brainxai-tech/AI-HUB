@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

if not exist ".next" (
  echo Building the app...
  call npm.cmd run build
  if errorlevel 1 (
    echo Failed to build the app.
    pause
    exit /b 1
  )
)

echo Starting XiaoHongShu Copywriting Master...
start "XHS Copywriting Master Server" /D "%~dp0" /min cmd.exe /k "npm.cmd run start"

echo Waiting for the local server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for ($i=0; $i -lt 30; $i++) { try { $r=Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok=$true; break } } catch { Start-Sleep -Seconds 1 } }; if (-not $ok) { exit 1 }"
if errorlevel 1 (
  echo The app did not become ready at http://localhost:3000.
  echo Please keep this window open and try running this file again.
  pause
  exit /b 1
)

start "" "http://localhost:3000"

echo Browser opened at http://localhost:3000
endlocal
