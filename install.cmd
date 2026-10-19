@echo off
cd /d "%~dp0"
call npm install --no-fund
if errorlevel 1 exit /b 1
call npm run setup
if errorlevel 1 exit /b 1
call npm test
