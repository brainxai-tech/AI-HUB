@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local-server.ps1"
set EXIT_CODE=%ERRORLEVEL%
echo.
if errorlevel 1 (
  echo AI Cooking Coach local server stopped or failed.
) else (
  echo AI Cooking Coach local server stopped.
)
echo Keep this window open while generating cooking plans.
echo Close this window only when you are finished using the app.
pause
exit /b %EXIT_CODE%
