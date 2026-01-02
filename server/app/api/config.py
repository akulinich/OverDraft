"""
Config sharing API endpoint.
Stores and retrieves shared configurations with 30-day TTL.
"""

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter

from app.config import get_settings

router = APIRouter()
settings = get_settings()

# Config storage directory
CONFIG_DIR = Path(os.environ.get("CONFIG_STORAGE_PATH", "data/configs"))

# TTL for shared configs (30 days)
CONFIG_TTL_DAYS = 30


def get_rate_limit_key(request: Request) -> str:
    """Generate rate limit key based on IP."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return ip


# Rate limiter for config endpoints
limiter = Limiter(key_func=get_rate_limit_key)


class ShareConfigRequest(BaseModel):
    """Request body for sharing a config."""
    config: str = Field(..., min_length=1, max_length=100000, description="Base64-encoded config")


class ShareConfigResponse(BaseModel):
    """Response for successful config share."""
    guid: str
    expiresAt: str


class GetConfigResponse(BaseModel):
    """Response for getting a shared config."""
    config: str
    createdAt: str
    expiresAt: str


def ensure_config_dir() -> None:
    """Ensure config storage directory exists."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def cleanup_expired_configs() -> int:
    """
    Remove expired config files.
    Returns count of removed files.
    """
    if not CONFIG_DIR.exists():
        return 0
    
    now = datetime.now(timezone.utc)
    removed = 0
    
    for config_file in CONFIG_DIR.glob("*.json"):
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            expires_at = datetime.fromisoformat(data.get("expiresAt", ""))
            if expires_at < now:
                config_file.unlink()
                removed += 1
        except (json.JSONDecodeError, ValueError, OSError):
            # Invalid file, remove it
            try:
                config_file.unlink()
                removed += 1
            except OSError:
                pass
    
    return removed


@router.post("/config/share", response_model=ShareConfigResponse)
@limiter.limit("10/minute")  # Limit share requests to prevent abuse
async def share_config(request: Request, body: ShareConfigRequest):
    """
    Store a config and return a GUID for sharing.
    
    The config is stored for 30 days.
    """
    ensure_config_dir()
    
    # Generate unique ID
    guid = str(uuid.uuid4())
    
    # Calculate expiration
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=CONFIG_TTL_DAYS)
    
    # Store config
    config_data = {
        "config": body.config,
        "createdAt": now.isoformat(),
        "expiresAt": expires_at.isoformat()
    }
    
    config_path = CONFIG_DIR / f"{guid}.json"
    
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config_data, f)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to store config: {str(e)}")
    
    return ShareConfigResponse(
        guid=guid,
        expiresAt=expires_at.isoformat()
    )


@router.get("/config/{guid}", response_model=GetConfigResponse)
@limiter.limit("60/minute")
async def get_config(request: Request, guid: str):
    """
    Retrieve a shared config by GUID.
    
    Returns 404 if not found, 410 if expired.
    """
    # Validate GUID format
    try:
        uuid.UUID(guid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid GUID format")
    
    config_path = CONFIG_DIR / f"{guid}.json"
    
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Config not found. The share link may have expired or is invalid.")
    
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        raise HTTPException(status_code=500, detail="Failed to read config")
    
    # Check expiration
    expires_at = datetime.fromisoformat(data.get("expiresAt", ""))
    if expires_at < datetime.now(timezone.utc):
        # Remove expired config
        try:
            config_path.unlink()
        except OSError:
            pass
        raise HTTPException(status_code=410, detail="Config has expired. Please request a new share link.")
    
    return GetConfigResponse(
        config=data["config"],
        createdAt=data["createdAt"],
        expiresAt=data["expiresAt"]
    )

