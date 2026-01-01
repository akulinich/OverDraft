"""
FastAPI application entry point.
"""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.sheets import router as sheets_router
from app.config import get_settings

settings = get_settings()

# Version from build arg (via ENV)
API_VERSION = os.environ.get("APP_VERSION", "dev")

# Rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])

app = FastAPI(
    title="OverDraft API",
    description="Caching proxy for Google Sheets API",
    version=API_VERSION,
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
if settings.cors_allow_all:
    # Development mode - allow all origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,  # Must be False when using "*"
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["ETag"],
    )
else:
    # Production mode - specific origins only
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["ETag"],
    )

# Include routers
app.include_router(sheets_router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint with version info."""
    return {"status": "ok", "version": API_VERSION}
