@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing CampusConnect AI dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
echo Starting CampusConnect AI. Open http://localhost:5173 in your browser.
call npm run dev
