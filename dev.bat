@echo off
REM OverDraft Local Development Launcher
REM This script runs dev.ps1 with PowerShell
REM
REM Usage:
REM   dev.bat                    - Start both server and client
REM   dev.bat -ServerOnly        - Start only API server
REM   dev.bat -ClientOnly        - Start only frontend
REM   dev.bat -NoBrowser         - Don't auto-open browser
REM   dev.bat -Port 5000         - Custom client port
REM   dev.bat -ApiPort 9000      - Custom server port

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*

