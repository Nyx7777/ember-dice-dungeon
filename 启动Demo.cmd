@echo off
cd /d "%~dp0"
if not exist node_modules\typescript\bin\tsc (
  echo Please run npm.cmd install first.
  pause
  exit /b 1
)
call npm.cmd run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo Open http://localhost:4173 in your browser.
echo Close this window to stop the demo server.
call npm.cmd run dev
pause
