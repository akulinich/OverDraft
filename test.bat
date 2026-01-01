@echo off
cd /d "%~dp0"

echo === Running Server Tests ===
cd server
call python -m pytest tests/ -v --tb=short
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Server tests failed!
    pause
    exit /b 1
)
cd ..

echo.
echo === Running Frontend Tests ===
cd src
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Frontend tests failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [OK] All tests passed!
pause
