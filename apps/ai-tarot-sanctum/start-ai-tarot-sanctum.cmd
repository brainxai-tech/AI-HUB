@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if exist dev-server.port (
  call :read_port
  if "!PORT!"=="" (
    echo dev-server.port is empty or unreadable. Starting a fresh server...
  ) else (
    set "APP_URL=http://localhost:!PORT!/"
    call :check_url
    if not errorlevel 1 (
      echo Tarot Sanctum is already running at !APP_URL!
      call :open_url
      call :linger
      endlocal
      exit /b 0
    )
  )
)

echo Starting Tarot Sanctum...
call npm run dev:detached
if errorlevel 1 (
  echo Failed to start dev server. See dev-server.err.log.
  pause
  exit /b 1
)

if not exist dev-server.port (
  echo Could not find dev-server.port. See dev-server.err.log.
  pause
  exit /b 1
)

call :read_port
if "!PORT!"=="" (
  echo dev-server.port is empty. See dev-server.out.log and dev-server.err.log.
  pause
  exit /b 1
)

set "APP_URL=http://localhost:!PORT!/"
for /l %%i in (1,1,30) do (
  call :check_url
  if not errorlevel 1 goto ready
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1" >nul 2>nul
)

echo Dev server started, but it did not respond yet at !APP_URL!
echo Check dev-server.out.log and dev-server.err.log.
pause
exit /b 1

:ready
call :open_url

echo Tarot Sanctum is ready at !APP_URL!
call :linger
endlocal
exit /b 0

:read_port
set "PORT="
for /f "delims=" %%p in ('type dev-server.port 2^>nul') do set "PORT=%%p"
exit /b 0

:check_url
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri $env:APP_URL -TimeoutSec 2; if ($r.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:open_url
if /I "%NO_OPEN%"=="1" exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process $env:APP_URL; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 start "" "!APP_URL!"
exit /b 0

:linger
if /I "%NO_LINGER%"=="1" exit /b 0
echo.
echo If the browser did not open, copy this URL:
echo !APP_URL!
timeout /t 4 /nobreak >nul
exit /b 0
