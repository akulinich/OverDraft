<#
.SYNOPSIS
    OverDraft Local Development Script
    
.DESCRIPTION
    Starts both the Python API server and Vite frontend for local development.
    Requires GOOGLE_API_KEY to be set in scripts/dev.env or environment.

.PARAMETER ServerOnly
    Start only the API server (skip frontend)

.PARAMETER ClientOnly
    Start only the Vite frontend (skip server)

.PARAMETER NoBrowser
    Don't auto-open browser when starting

.PARAMETER Port
    Override Vite dev server port (default: 3000)

.PARAMETER ApiPort
    Override API server port (default: 8000)

.EXAMPLE
    .\dev.ps1
    # Starts both server and client

.EXAMPLE
    .\dev.ps1 -ServerOnly
    # Starts only the API server

.EXAMPLE
    .\dev.ps1 -ClientOnly
    # Starts only the frontend (assumes server already running)

.EXAMPLE
    .\dev.ps1 -Port 5000 -ApiPort 9000
    # Custom ports
#>

param(
    [switch]$ServerOnly,
    [switch]$ClientOnly,
    [switch]$NoBrowser,
    [int]$Port = 0,
    [int]$ApiPort = 0
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# =============================================================================
# Load Environment
# =============================================================================

function Load-EnvFile {
    param([string]$Path)
    
    if (Test-Path $Path) {
        Write-Info "Loading environment from $Path"
        Get-Content $Path | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remove quotes if present
                $value = $value -replace '^["'']|["'']$', ''
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
}

# Load dev.env if exists
$DevEnvPath = Join-Path $ScriptDir "scripts\dev.env"
if (Test-Path $DevEnvPath) {
    Load-EnvFile $DevEnvPath
} else {
    Write-Warn "scripts/dev.env not found, using environment variables only"
}

# =============================================================================
# Validate Required Configuration
# =============================================================================

$GoogleApiKey = $env:GOOGLE_API_KEY

if (-not $GoogleApiKey -or $GoogleApiKey -eq "your_api_key_here") {
    Write-Err "GOOGLE_API_KEY is required but not set."
    Write-Host ""
    Write-Host "To fix:" -ForegroundColor Yellow
    Write-Host "  1. Copy scripts/dev.env.example to scripts/dev.env"
    Write-Host "  2. Set your Google API key in scripts/dev.env"
    Write-Host "  3. Run this script again"
    Write-Host ""
    Write-Host "Get a key from: https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan
    exit 1
}

Write-Success "GOOGLE_API_KEY configured"

# =============================================================================
# Set Ports
# =============================================================================

$ServerPort = if ($ApiPort -gt 0) { $ApiPort } elseif ($env:SERVER_PORT) { [int]$env:SERVER_PORT } else { 8000 }
$ClientPort = if ($Port -gt 0) { $Port } elseif ($env:CLIENT_PORT) { [int]$env:CLIENT_PORT } else { 3000 }

Write-Info "Server port: $ServerPort"
Write-Info "Client port: $ClientPort"

# Set VITE_API_URL for frontend
$env:VITE_API_URL = "http://localhost:$ServerPort"

# =============================================================================
# Check Dependencies
# =============================================================================

function Test-PythonVenv {
    $VenvPath = Join-Path $ScriptDir "server\venv"
    return Test-Path (Join-Path $VenvPath "Scripts\python.exe")
}

function New-PythonVenv {
    Write-Info "Creating Python virtual environment..."
    Push-Location (Join-Path $ScriptDir "server")
    try {
        python -m venv venv
        if ($LASTEXITCODE -ne 0) { throw "Failed to create venv" }
        
        Write-Info "Installing Python dependencies..."
        & ".\venv\Scripts\pip.exe" install -r requirements.txt -q
        if ($LASTEXITCODE -ne 0) { throw "Failed to install dependencies" }
        
        Write-Success "Python environment ready"
    } finally {
        Pop-Location
    }
}

function Test-NpmDeps {
    $NodeModules = Join-Path $ScriptDir "src\node_modules"
    return Test-Path $NodeModules
}

function Install-NpmDeps {
    Write-Info "Installing npm dependencies..."
    Push-Location (Join-Path $ScriptDir "src")
    try {
        npm install --silent
        if ($LASTEXITCODE -ne 0) { throw "Failed to install npm dependencies" }
        Write-Success "npm dependencies ready"
    } finally {
        Pop-Location
    }
}

# Check/setup Python venv
if (-not $ClientOnly) {
    if (-not (Test-PythonVenv)) {
        New-PythonVenv
    } else {
        Write-Success "Python venv exists"
    }
}

# Check/setup npm deps
if (-not $ServerOnly) {
    if (-not (Test-NpmDeps)) {
        Install-NpmDeps
    } else {
        Write-Success "npm dependencies exist"
    }
}

# =============================================================================
# Cleanup Handler
# =============================================================================

$script:ServerProcess = $null

function Stop-DevServer {
    if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        Write-Info "Stopping API server..."
        Stop-Process -Id $script:ServerProcess.Id -Force -ErrorAction SilentlyContinue
        $script:ServerProcess = $null
    }
}

# Register cleanup on script exit
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-DevServer }

trap {
    Stop-DevServer
    break
}

# =============================================================================
# Start Servers
# =============================================================================

# Start API Server
if (-not $ClientOnly) {
    Write-Info "Starting API server on port $ServerPort..."
    
    # Set environment variables for the server process
    $env:PORT = $ServerPort
    $env:HOST = "127.0.0.1"
    
    # Start server using Start-Process (avoids PowerShell job network isolation issues)
    $ServerPath = Join-Path $ScriptDir "server"
    $PythonExe = Join-Path $ServerPath "venv\Scripts\python.exe"
    
    $script:ServerProcess = Start-Process -FilePath $PythonExe `
        -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port $ServerPort --reload" `
        -WorkingDirectory $ServerPath `
        -PassThru `
        -WindowStyle Hidden
    
    # Wait for server to start
    Write-Info "Waiting for API server to be ready..."
    $MaxAttempts = 30
    $Attempt = 0
    $ServerReady = $false
    
    while ($Attempt -lt $MaxAttempts -and -not $ServerReady) {
        Start-Sleep -Milliseconds 500
        $Attempt++
        
        # Check if process died
        if ($script:ServerProcess.HasExited) {
            Write-Err "Server process exited with code: $($script:ServerProcess.ExitCode)"
            exit 1
        }
        
        try {
            # Use WebClient instead of Invoke-WebRequest (avoids proxy timeout issues)
            $wc = New-Object System.Net.WebClient
            $Response = $wc.DownloadString("http://localhost:$ServerPort/health")
            
            if ($Response -match '"status"\s*:\s*"ok"') {
                $ServerReady = $true
            }
        } catch {
            # Server not ready yet, continue waiting
        }
    }
    
    if ($ServerReady) {
        Write-Success "API server ready at http://localhost:$ServerPort"
    } else {
        Write-Err "API server failed to start within timeout"
        Stop-DevServer
        exit 1
    }
}

# Start Vite dev server
if (-not $ServerOnly) {
    Write-Info "Starting Vite dev server on port $ClientPort..."
    
    Push-Location (Join-Path $ScriptDir "src")
    try {
        $ViteArgs = @("run", "dev", "--", "--port", $ClientPort)
        if ($NoBrowser) {
            $ViteArgs += "--no-open"
        }
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "  OverDraft Development Server" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Frontend: http://localhost:$ClientPort" -ForegroundColor Green
        Write-Host "  API:      http://localhost:$ServerPort" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
        Write-Host ""
        
        # Run Vite in foreground
        npm @ViteArgs
    } finally {
        Pop-Location
        Stop-DevServer
    }
} else {
    # Server-only mode - keep running until Ctrl+C
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  OverDraft API Server" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  API: http://localhost:$ServerPort" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
    Write-Host ""
    
    try {
        # Keep script running until server process exits or Ctrl+C
        while (-not $script:ServerProcess.HasExited) {
            Start-Sleep -Seconds 1
        }
        Write-Warn "Server process exited with code: $($script:ServerProcess.ExitCode)"
    } finally {
        Stop-DevServer
    }
}

