@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)
set "PORT=5179"
set "OPEN_BROWSER=1"
echo Starting local site on http://127.0.0.1:%PORT%
echo Keep this window open. Press Ctrl+C to stop.
echo.
node server.mjs
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo Server stopped with error code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
