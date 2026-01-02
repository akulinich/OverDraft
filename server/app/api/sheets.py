"""
Sheets API endpoint.
Provides cached access to Google Sheets data with ETag support.
Returns CSV format for compatibility with existing client code.

Optimization: Fetches entire spreadsheet in one Google API call,
then serves individual sheet requests from cache.
"""

import re
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from slowapi import Limiter

from app.config import get_settings
from app.services.cache import get_cache
from app.services.google_sheets import GoogleSheetsError, get_sheets_client
from app.services.metrics import get_metrics


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
    lines.append(','.join(escape_field(h) for h in headers))
    for row in data:
        lines.append(','.join(escape_field(cell) for cell in row))
    
    return '\n'.join(lines)


router = APIRouter()
settings = get_settings()


def get_rate_limit_key(request: Request) -> str:
    """
    Generate rate limit key based on IP + spreadsheetId.
    This allows N requests/minute per spreadsheet per IP,
    rather than a global limit across all spreadsheets.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    
    spreadsheet_id = request.query_params.get("spreadsheetId", "unknown")
    
    return f"{ip}:{spreadsheet_id}"


limiter = Limiter(key_func=get_rate_limit_key)

# Validation patterns
SPREADSHEET_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{10,100}$")
GID_PATTERN = re.compile(r"^[0-9]{1,20}$")


def validate_spreadsheet_id(spreadsheet_id: str) -> None:
    """Validate spreadsheet ID format."""
    if not SPREADSHEET_ID_PATTERN.match(spreadsheet_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid spreadsheet ID format. Expected alphanumeric string with dashes/underscores."
        )


def validate_gid(gid: str) -> None:
    """Validate GID format."""
    if not GID_PATTERN.match(gid):
        raise HTTPException(
            status_code=400,
            detail="Invalid gid format. Expected numeric string."
        )


@router.get("/sheets")
@limiter.limit(settings.rate_limit)
async def get_sheet(
    request: Request,
    response: Response,
    spreadsheet_id: Annotated[str, Query(alias="spreadsheetId", min_length=1, max_length=100)],
    gid: Annotated[str, Query(min_length=1, max_length=20)],
    if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
):
    """
    Fetch sheet data with caching and ETag support.
    
    Optimization: Caches entire spreadsheet, serves individual sheets from cache.
    One Google API call serves all sheets in the same document.
    
    Query Parameters:
        spreadsheetId: Google Sheets document ID
        gid: Sheet tab ID
        
    Headers:
        If-None-Match: Optional ETag from previous response
        
    Returns:
        200: Sheet data as CSV with ETag header
        304: Not Modified (data unchanged, empty body)
        400: Invalid parameters
        404: Sheet not found
        429: Rate limit exceeded
        502: Google API error
    """
    validate_spreadsheet_id(spreadsheet_id)
    validate_gid(gid)
    
    cache = get_cache()
    client = get_sheets_client()
    metrics = get_metrics()
    
    # Check cache first (by spreadsheet_id, extract specific sheet)
    cached_sheet = cache.get_sheet(spreadsheet_id, gid)
    
    if cached_sheet is not None:
        # Cache hit
        metrics.record_cache_hit()
        
        # Check ETag
        if if_none_match and if_none_match == cached_sheet.etag:
            return Response(status_code=304, headers={
                "ETag": cached_sheet.etag,
                "Cache-Control": "no-cache"
            })
        
        # Return cached sheet as CSV
        csv_content = to_csv(cached_sheet.headers, cached_sheet.data)
        return Response(
            content=csv_content,
            media_type="text/csv; charset=utf-8",
            headers={
                "ETag": cached_sheet.etag,
                "Cache-Control": "no-cache"
            }
        )
    
    # Cache miss - fetch entire spreadsheet from Google
    metrics.record_cache_miss()
    
    try:
        spreadsheet_data = await client.fetch_spreadsheet(spreadsheet_id)
        metrics.record_google_request(spreadsheet_id)
    except GoogleSheetsError as e:
        metrics.record_error()
        if e.error_type == "NOT_FOUND":
            raise HTTPException(status_code=404, detail=str(e))
        if e.error_type == "NOT_PUBLISHED":
            raise HTTPException(status_code=403, detail=str(e))
        if e.error_type == "CONFIG_ERROR":
            raise HTTPException(status_code=500, detail=str(e))
        if e.error_type == "RATE_LIMITED":
            raise HTTPException(status_code=502, detail=str(e))
        raise HTTPException(status_code=502, detail=str(e))
    
    # Store entire spreadsheet in cache
    cache.set_spreadsheet(spreadsheet_id, spreadsheet_data)
    
    # Extract the requested sheet
    sheet = client.get_sheet_from_spreadsheet(spreadsheet_data, gid)
    
    if sheet is None:
        raise HTTPException(
            status_code=404,
            detail=f"Sheet with gid={gid} not found in spreadsheet"
        )
    
    headers = sheet.get("headers", [])
    data = sheet.get("data", [])
    
    # Compute ETag for this specific sheet
    sheet_etag = cache.compute_etag({"headers": headers, "data": data})
    
    # Check if client already has this data
    if if_none_match and if_none_match == sheet_etag:
        return Response(status_code=304, headers={
            "ETag": sheet_etag,
            "Cache-Control": "no-cache"
        })
    
    # Return as CSV
    csv_content = to_csv(headers, data)
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "ETag": sheet_etag,
            "Cache-Control": "no-cache"
        }
    )
