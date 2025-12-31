@echo off
cd /d "%~dp0src"
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Tests failed!
    pause
    exit /b 1
)
echo.
echo [OK] All tests passed!
pause




