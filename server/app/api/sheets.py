"""
Sheets API endpoint.
Provides cached access to Google Sheets data with ETag support.
"""

import re
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings
from app.services.cache import get_cache
from app.services.google_sheets import GoogleSheetsError, get_sheets_client

router = APIRouter()
settings = get_settings()

# Rate limiter instance (shared with main app)
limiter = Limiter(key_func=get_remote_address)

# Validation patterns
# Google Sheets ID: alphanumeric with dashes and underscores, typically 44 chars
SPREADSHEET_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{10,100}$")
# GID: numeric string
GID_PATTERN = re.compile(r"^[0-9]{1,20}$")


def validate_spreadsheet_id(spreadsheet_id: str) -> None:
    """
    Validate spreadsheet ID format.
    
    Raises:
        HTTPException: If format is invalid
    """
    if not SPREADSHEET_ID_PATTERN.match(spreadsheet_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid spreadsheet ID format. Expected alphanumeric string with dashes/underscores."
        )


def validate_gid(gid: str) -> None:
    """
    Validate GID format.
    
    Raises:
        HTTPException: If format is invalid
    """
    if not GID_PATTERN.match(gid):
        raise HTTPException(
            status_code=400,
            detail="Invalid gid format. Expected numeric string."
        )


@router.get("/sheets")
@limiter.limit(settings.rate_limit)
async def get_sheet(
    request: Request,  # Required for rate limiter
    response: Response,
    spreadsheet_id: Annotated[str, Query(alias="spreadsheetId", min_length=1, max_length=100)],
    gid: Annotated[str, Query(min_length=1, max_length=20)],
    if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
):
    """
    Fetch sheet data with caching and ETag support.
    
    Query Parameters:
        spreadsheetId: Google Sheets document ID
        gid: Sheet tab ID
        
    Headers:
        If-None-Match: Optional ETag from previous response
        
    Returns:
        200: Sheet data with ETag header
        304: Not Modified (data unchanged, empty body)
        400: Invalid parameters
        404: Sheet not found
        429: Rate limit exceeded
        502: Google API error
    """
    # Validate input formats
    validate_spreadsheet_id(spreadsheet_id)
    validate_gid(gid)
    
    cache = get_cache()
    client = get_sheets_client()
    
    # Check cache first
    cached = cache.get(spreadsheet_id, gid)
    
    if cached is not None:
        # Cache hit - check ETag
        if if_none_match and if_none_match == cached.etag:
            # Client has current data
            return Response(status_code=304, headers={
                "ETag": cached.etag,
                "Cache-Control": "no-cache"
            })
        
        # Return cached data
        response.headers["ETag"] = cached.etag
        response.headers["Cache-Control"] = "no-cache"
        return {
            **cached.data,
            "lastUpdated": datetime.now(timezone.utc).isoformat()
        }
    
    # Cache miss - fetch from Google
    try:
        data = await client.fetch_sheet(spreadsheet_id, gid)
    except GoogleSheetsError as e:
        if e.error_type == "NOT_FOUND":
            raise HTTPException(status_code=404, detail=str(e))
        if e.error_type == "NOT_PUBLISHED":
            raise HTTPException(status_code=403, detail=str(e))
        if e.error_type == "CONFIG_ERROR":
            raise HTTPException(status_code=500, detail=str(e))
        # Network or API errors
        raise HTTPException(status_code=502, detail=str(e))
    
    # Store in cache
    entry = cache.set(spreadsheet_id, gid, data)
    
    # Check if client already has this data
    if if_none_match and if_none_match == entry.etag:
        return Response(status_code=304, headers={
            "ETag": entry.etag,
            "Cache-Control": "no-cache"
        })
    
    response.headers["ETag"] = entry.etag
    response.headers["Cache-Control"] = "no-cache"
    
    return {
        **data,
        "lastUpdated": datetime.now(timezone.utc).isoformat()
    }
