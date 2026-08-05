@echo off
setlocal

cd /d "%~dp0"
set "DEFAULT_PORT=3210"
set "PORT=%DEFAULT_PORT%"

echo Starting Qingqing Grassland Personality Test...

call :check_url "http://localhost:%PORT%/"
if errorlevel 1 (
  node scripts\start-dev-server.mjs %DEFAULT_PORT%
  if errorlevel 1 (
    echo.
    echo Failed to start the local server.
    echo Please check dev-server.err.log in this folder.
    pause
    exit /b 1
  )
)

if exist "dev-server.port" (
  set /p PORT=<"dev-server.port"
)

set "URL=http://localhost:%PORT%/"
echo Waiting for %URL%

for /l %%i in (1,1,45) do (
  call :check_url "%URL%"
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo.
echo The local page did not become ready in time.
echo Try opening %URL% manually, or check dev-server.err.log.
pause
exit /b 1

:ready
echo Opening %URL%
if "%NO_OPEN%"=="1" (
  echo NO_OPEN=1, browser launch skipped for verification.
  exit /b 0
)
start "" "%URL%"
exit /b 0

:check_url
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%~1' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; exit 1"
exit /b %ERRORLEVEL%
