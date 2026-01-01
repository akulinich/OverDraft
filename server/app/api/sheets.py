"""
Sheets API endpoint.
Provides cached access to Google Sheets data with ETag support.
Returns CSV format for compatibility with existing client code.
"""

import re
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from slowapi import Limiter

from app.config import get_settings
from app.services.cache import get_cache
from app.services.google_sheets import GoogleSheetsError, get_sheets_client


def to_csv(headers: list[str], data: list[list[str]]) -> str:
    """
    Convert headers and data rows to CSV format.
    Handles quoting for fields containing comma, quote, or newline.
    """
    def escape_field(field: str) -> str:
        if not isinstance(field, str):
            field = str(field) if field is not None else ""
        if '"' in field or ',' in field or '\n' in field or '\r' in field:
            return '"' + field.replace('"', '""') + '"'
        return field
    
    lines = []
    # Add headers as first row
    lines.append(','.join(escape_field(h) for h in headers))
    # Add data rows
    for row in data:
        lines.append(','.join(escape_field(cell) for cell in row))
    
    return '\n'.join(lines)

router = APIRouter()
settings = get_settings()


def get_rate_limit_key(request: Request) -> str:
    """
    Generate rate limit key based on IP + spreadsheetId.
    This allows 90 requests/minute per spreadsheet per IP,
    rather than a global limit across all spreadsheets.
    """
    # Get client IP (handles proxies via X-Forwarded-For)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    
    # Get spreadsheetId from query params
    spreadsheet_id = request.query_params.get("spreadsheetId", "unknown")
    
    return f"{ip}:{spreadsheet_id}"


# Rate limiter instance with per-spreadsheet key
limiter = Limiter(key_func=get_rate_limit_key)

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
        
        # Return cached data as CSV
        csv_content = to_csv(cached.data.get("headers", []), cached.data.get("data", []))
        return Response(
            content=csv_content,
            media_type="text/csv; charset=utf-8",
            headers={
                "ETag": cached.etag,
                "Cache-Control": "no-cache"
            }
        )
    
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
    
    # Return as CSV
    csv_content = to_csv(data.get("headers", []), data.get("data", []))
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "ETag": entry.etag,
            "Cache-Control": "no-cache"
        }
    )
