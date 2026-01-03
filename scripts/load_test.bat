@echo off
REM OverDraft Load Testing Script
REM Usage: load_test.bat [host] [users]
REM
REM Examples:
REM   load_test.bat                          - Local with Web UI (10 users)
REM   load_test.bat http://localhost:8000 50 - Local with 50 users
REM   load_test.bat https://your-vps.com 100 - VPS with 100 users

setlocal

set HOST=%1
set USERS=%2

if "%HOST%"=="" set HOST=http://localhost:8000
if "%USERS%"=="" set USERS=10

echo.
echo ================================================
echo OverDraft Load Testing
echo ================================================
echo Target: %HOST%
echo Users: %USERS%
echo.
echo Web UI will be available at http://localhost:8089
echo Press Ctrl+C to stop the test
echo ================================================
echo.

python "%~dp0load_test.py" --host %HOST% --users %USERS%

endlocal



