"""
Google Sheets API client.
Fetches only specific sheets instead of entire document.
Includes request coalescing to prevent duplicate API calls.
Rate limited to 60 requests per minute to Google API.
"""

import asyncio
import time
import httpx
from collections import deque
from typing import Any

from app.config import get_settings


class GoogleSheetsError(Exception):
    """Base exception for Google Sheets operations."""
    
    def __init__(self, error_type: str, message: str, spreadsheet_id: str = "", gid: str = ""):
        super().__init__(message)
        self.error_type = error_type
        self.spreadsheet_id = spreadsheet_id
        self.gid = gid


class RateLimiter:
    """
    Sliding window rate limiter for Google API requests.
    
    Limits requests to max_requests per window_seconds.
    If limit is exceeded, waits until a slot becomes available.
    """
    
    def __init__(self, max_requests: int = 60, window_seconds: float = 60.0):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()
    
    async def acquire(self) -> None:
        """
        Acquire a rate limit slot. Waits if limit is exceeded.
        """
        async with self._lock:
            now = time.time()
            
            # Remove timestamps outside the window
            while self._timestamps and now - self._timestamps[0] > self.window_seconds:
                self._timestamps.popleft()
            
            # If at limit, wait until oldest request expires
            if len(self._timestamps) >= self.max_requests:
                wait_time = self._timestamps[0] + self.window_seconds - now
                if wait_time > 0:
                    await asyncio.sleep(wait_time)
                    # Clean up again after waiting
                    now = time.time()
                    while self._timestamps and now - self._timestamps[0] > self.window_seconds:
                        self._timestamps.popleft()
            
            # Record this request
            self._timestamps.append(time.time())
    
    @property
    def current_count(self) -> int:
        """Get current number of requests in the window."""
        now = time.time()
        while self._timestamps and now - self._timestamps[0] > self.window_seconds:
            self._timestamps.popleft()
        return len(self._timestamps)


class GoogleSheetsClient:
    """
    Client for fetching data from Google Sheets API.
    
    Strategy:
    1. Fetch metadata (gid→name mapping) once, cache it longer
    2. Fetch only specific sheet data using ranges parameter
    3. Request coalescing per (spreadsheet_id, gid) pair
    4. Rate limiting: configurable via GOOGLE_RATE_LIMIT env var
    """
    
    BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"
    METADATA_TTL = 300  # 5 minutes for metadata cache
    
    def __init__(self):
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None
        # Track in-flight requests for coalescing: key = (spreadsheet_id, gid)
        self._pending_requests: dict[tuple[str, str], asyncio.Task] = {}
        # Cache for metadata (gid → sheet name): key = spreadsheet_id
        self._metadata_cache: dict[str, tuple[dict[str, str], float]] = {}
        # Parse rate limit from config (format: "60/minute")
        max_requests, window_seconds = self._parse_rate_limit(self.settings.google_rate_limit)
        self._rate_limit_requests = max_requests
        self._rate_limit_window = window_seconds
        # Rate limiter for Google API requests
        self._rate_limiter = RateLimiter(max_requests, window_seconds)
    
    @staticmethod
    def _parse_rate_limit(rate_limit: str) -> tuple[int, float]:
        """
        Parse rate limit string like "60/minute" into (count, seconds).
        
        Supports: /second, /minute, /hour
        """
        try:
            count_str, period = rate_limit.split("/")
            count = int(count_str)
            
            period_seconds = {
                "second": 1.0,
                "minute": 60.0,
                "hour": 3600.0,
            }
            
            seconds = period_seconds.get(period.lower(), 60.0)
            return count, seconds
        except (ValueError, AttributeError):
            # Default to 60/minute
            return 60, 60.0
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    def _get_cached_metadata(self, spreadsheet_id: str) -> dict[str, str] | None:
        """Get cached gid→name mapping if not expired."""
        if spreadsheet_id not in self._metadata_cache:
            return None
        mapping, expires_at = self._metadata_cache[spreadsheet_id]
        if time.time() > expires_at:
            del self._metadata_cache[spreadsheet_id]
            return None
        return mapping
    
    def _cache_metadata(self, spreadsheet_id: str, mapping: dict[str, str]):
        """Cache gid→name mapping."""
        expires_at = time.time() + self.METADATA_TTL
        self._metadata_cache[spreadsheet_id] = (mapping, expires_at)
    
    async def fetch_sheet(self, spreadsheet_id: str, gid: str) -> dict[str, Any]:
        """
        Fetch a specific sheet by gid.
        
        Uses two-step process:
        1. Get metadata (cached) to find sheet name
        2. Fetch only that sheet's data using ranges parameter
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID
            
        Returns:
            dict with headers and data arrays
            
        Raises:
            GoogleSheetsError: On API errors or if sheet not found
        """
        if not self.settings.google_api_key:
            raise GoogleSheetsError(
                "CONFIG_ERROR",
                "Google API key not configured",
                spreadsheet_id,
                gid
            )
        
        key = (spreadsheet_id, gid)
        
        # Check if request is already in-flight (coalescing)
        if key in self._pending_requests:
            return await self._pending_requests[key]
        
        # Create new request task
        task = asyncio.create_task(self._do_fetch_sheet(spreadsheet_id, gid))
        self._pending_requests[key] = task
        
        try:
            return await task
        finally:
            self._pending_requests.pop(key, None)
    
    async def _do_fetch_sheet(self, spreadsheet_id: str, gid: str) -> dict[str, Any]:
        """
        Actually fetch a specific sheet.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID
            
        Returns:
            Sheet data with headers and rows
        """
        # Step 1: Get sheet name from metadata (may use cache)
        sheet_name = await self._get_sheet_name(spreadsheet_id, gid)
        
        if sheet_name is None:
            raise GoogleSheetsError(
                "NOT_FOUND",
                f"Sheet with gid={gid} not found",
                spreadsheet_id,
                gid
            )
        
        # Step 2: Fetch only this sheet's data (rate limited)
        await self._rate_limiter.acquire()
        
        client = await self._get_client()
        
        # Use ranges parameter to fetch only specific sheet
        url = f"{self.BASE_URL}/{spreadsheet_id}"
        params = {
            "key": self.settings.google_api_key,
            "includeGridData": "true",
            "ranges": sheet_name  # Fetch only this sheet
        }
        
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as e:
            raise GoogleSheetsError(
                "NETWORK",
                f"Network error: {e}",
                spreadsheet_id,
                gid
            )
        
        if response.status_code == 404:
            raise GoogleSheetsError("NOT_FOUND", "Spreadsheet not found", spreadsheet_id, gid)
        if response.status_code == 403:
            raise GoogleSheetsError("NOT_PUBLISHED", "Spreadsheet is not public", spreadsheet_id, gid)
        if response.status_code == 429:
            raise GoogleSheetsError("RATE_LIMITED", "Google API rate limit exceeded", spreadsheet_id, gid)
        if not response.is_success:
            raise GoogleSheetsError("API_ERROR", f"Google API error: {response.status_code}", spreadsheet_id, gid)
        
        raw_data = response.json()
        return self._parse_single_sheet(spreadsheet_id, gid, sheet_name, raw_data)
    
    async def _get_sheet_name(self, spreadsheet_id: str, gid: str) -> str | None:
        """
        Get sheet name for a given gid.
        Uses cached metadata when available.
        
        Args:
            spreadsheet_id: Spreadsheet ID
            gid: Sheet ID
            
        Returns:
            Sheet name or None if not found
        """
        # Check cache first
        cached = self._get_cached_metadata(spreadsheet_id)
        if cached is not None:
            return cached.get(gid)
        
        # Fetch metadata (without grid data - fast!) - rate limited
        await self._rate_limiter.acquire()
        
        client = await self._get_client()
        
        url = f"{self.BASE_URL}/{spreadsheet_id}"
        params = {
            "key": self.settings.google_api_key,
            "fields": "sheets.properties(sheetId,title)"  # Only metadata, no data!
        }
        
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as e:
            raise GoogleSheetsError("NETWORK", f"Network error: {e}", spreadsheet_id, gid)
        
        if response.status_code == 404:
            raise GoogleSheetsError("NOT_FOUND", "Spreadsheet not found", spreadsheet_id, gid)
        if response.status_code == 403:
            raise GoogleSheetsError("NOT_PUBLISHED", "Spreadsheet is not public", spreadsheet_id, gid)
        if response.status_code == 429:
            raise GoogleSheetsError("RATE_LIMITED", "Google API rate limit exceeded", spreadsheet_id, gid)
        if not response.is_success:
            raise GoogleSheetsError("API_ERROR", f"Google API error: {response.status_code}", spreadsheet_id, gid)
        
        raw_data = response.json()
        
        # Build gid→name mapping and cache it
        mapping: dict[str, str] = {}
        for sheet in raw_data.get("sheets", []):
            props = sheet.get("properties", {})
            sheet_id = str(props.get("sheetId", 0))
            title = props.get("title", "Sheet")
            mapping[sheet_id] = title
        
        self._cache_metadata(spreadsheet_id, mapping)
        
        return mapping.get(gid)
    
    def _parse_single_sheet(
        self, 
        spreadsheet_id: str, 
        gid: str, 
        title: str, 
        raw_data: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Parse response for a single sheet.
        
        Args:
            spreadsheet_id: Spreadsheet ID
            gid: Sheet ID
            title: Sheet title
            raw_data: Raw API response
            
        Returns:
            Parsed sheet data
        """
        sheets = raw_data.get("sheets", [])
        if not sheets:
            return {
                "spreadsheetId": spreadsheet_id,
                "gid": gid,
                "title": title,
                "headers": [],
                "data": []
            }
        
        # Should only have one sheet in response (the one we requested)
        sheet = sheets[0]
        grid_data = sheet.get("data", [])
        
        if not grid_data:
            return {
                "spreadsheetId": spreadsheet_id,
                "gid": gid,
                "title": title,
                "headers": [],
                "data": []
            }
        
        row_data = grid_data[0].get("rowData", [])
        rows = self._extract_rows(row_data)
        
        if not rows:
            return {
                "spreadsheetId": spreadsheet_id,
                "gid": gid,
                "title": title,
                "headers": [],
                "data": []
            }
        
        # First row is headers, rest is data
        headers = rows[0]
        data_rows = rows[1:] if len(rows) > 1 else []
        
        # Normalize row lengths
        max_cols = max(len(headers), max((len(r) for r in data_rows), default=0))
        
        def normalize_row(row: list) -> list:
            if len(row) < max_cols:
                return row + [""] * (max_cols - len(row))
            return row
        
        return {
            "spreadsheetId": spreadsheet_id,
            "gid": gid,
            "title": title,
            "headers": normalize_row(headers),
            "data": [normalize_row(row) for row in data_rows]
        }
    
    def _extract_rows(self, row_data: list[dict]) -> list[list[str]]:
        """
        Extract cell values from rowData structure.
        """
        rows = []
        for row in row_data:
            cells = row.get("values", [])
            row_values = []
            for cell in cells:
                value = cell.get("formattedValue", "")
                row_values.append(value if value is not None else "")
            rows.append(row_values)
        return rows
    
    # Keep for backwards compatibility with cache
    def get_sheet_from_spreadsheet(
        self, 
        spreadsheet_data: dict[str, Any], 
        gid: str
    ) -> dict[str, Any] | None:
        """Extract a specific sheet from spreadsheet data (for cache compatibility)."""
        sheets = spreadsheet_data.get("sheets", {})
        sheet = sheets.get(gid)
        if sheet is None:
            return None
        return {
            "spreadsheetId": spreadsheet_data.get("spreadsheetId"),
            "gid": gid,
            "title": sheet.get("title"),
            "headers": sheet.get("headers", []),
            "data": sheet.get("data", [])
        }
    
    # Legacy method - now redirects to fetch_sheet
    async def fetch_spreadsheet(self, spreadsheet_id: str) -> dict[str, Any]:
        """
        Fetch spreadsheet metadata only (for backwards compatibility).
        
        Note: This no longer fetches all data. Use fetch_sheet() for specific sheets.
        """
        # Just return metadata structure, actual sheet data should use fetch_sheet
        cached = self._get_cached_metadata(spreadsheet_id)
        if cached is None:
            # Trigger metadata fetch by requesting any sheet
            await self._get_sheet_name(spreadsheet_id, "0")
            cached = self._get_cached_metadata(spreadsheet_id) or {}
        
        return {
            "spreadsheetId": spreadsheet_id,
            "sheets": {gid: {"title": name, "headers": [], "data": []} for gid, name in cached.items()}
        }
    
    @property
    def rate_limit_status(self) -> dict[str, Any]:
        """Get current rate limit status for monitoring."""
        return {
            "current_requests": self._rate_limiter.current_count,
            "max_requests": self.RATE_LIMIT_REQUESTS,
            "window_seconds": self.RATE_LIMIT_WINDOW
        }


# Singleton instance
_client: GoogleSheetsClient | None = None


def get_sheets_client() -> GoogleSheetsClient:
    """Get singleton Google Sheets client."""
    global _client
    if _client is None:
        _client = GoogleSheetsClient()
    return _client
