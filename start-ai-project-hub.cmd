@echo off
setlocal
cd /d "%~dp0"
if not defined PORT set PORT=4194
set APP_URL=http://127.0.0.1:%PORT%/

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%APP_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if %ERRORLEVEL%==0 (
  echo AI Project Hub is already running. Opening %APP_URL%
  start "" "%APP_URL%"
  exit /b 0
)

echo Starting AI Project Hub: %APP_URL%
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-browser-when-ready.ps1" -Url "%APP_URL%"
npm start
set EXIT_CODE=%ERRORLEVEL%
echo.
if errorlevel 1 (
  echo AI Project Hub failed to start or has stopped.
) else (
  echo AI Project Hub has stopped.
)
pause
exit /b %EXIT_CODE%
