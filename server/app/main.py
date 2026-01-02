"""
FastAPI application entry point.
"""

import asyncio
import os

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.sheets import router as sheets_router
from app.api.config import router as config_router, cleanup_expired_configs
from app.config import get_settings
from app.services.cache import get_cache
from app.services.metrics import get_metrics

settings = get_settings()

# Version from build arg (via ENV)
API_VERSION = os.environ.get("APP_VERSION", "dev")

# Rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])

# Background task for cleanup
cleanup_task = None


async def periodic_cleanup():
    """Run cleanup every hour."""
    while True:
        try:
            removed = cleanup_expired_configs()
            if removed > 0:
                print(f"[Cleanup] Removed {removed} expired config(s)")
        except Exception as e:
            print(f"[Cleanup] Error: {e}")
        await asyncio.sleep(3600)  # 1 hour


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    global cleanup_task
    
    # Startup: run initial cleanup and start periodic task
    removed = cleanup_expired_configs()
    if removed > 0:
        print(f"[Startup] Cleaned up {removed} expired config(s)")
    
    cleanup_task = asyncio.create_task(periodic_cleanup())
    
    yield
    
    # Shutdown: cancel cleanup task
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="OverDraft API",
    description="Caching proxy for Google Sheets API",
    version=API_VERSION,
    lifespan=lifespan,
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
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["ETag"],
    )
else:
    # Production mode - specific origins only
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["ETag"],
    )

# Include routers
app.include_router(sheets_router, prefix="/api")
app.include_router(config_router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint with version info."""
    return {"status": "ok", "version": API_VERSION}


@app.get("/stats")
async def get_stats():
    """
    Get API usage statistics.
    
    Returns metrics including:
    - Google API request counts
    - Cache hit/miss statistics
    - Per-spreadsheet request breakdown
    """
    metrics = get_metrics()
    cache = get_cache()
    
    return {
        **metrics.to_dict(),
        "cache_size": cache.size()
    }
