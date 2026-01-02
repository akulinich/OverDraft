"""
Google Sheets API client with background polling.

Architecture:
- BackgroundPoller runs every 1 second (when users are active)
- Client requests never trigger Google API calls
- If no cached data, API returns 202 "pending"
- Poller fetches all subscribed sheets in one request per document
"""

import asyncio
import logging
import time
import httpx
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)


class GoogleSheetsError(Exception):
    """Base exception for Google Sheets operations."""
    
    def __init__(self, error_type: str, message: str, spreadsheet_id: str = "", gid: str = ""):
        super().__init__(message)
        self.error_type = error_type
        self.spreadsheet_id = spreadsheet_id
        self.gid = gid


class GoogleSheetsClient:
    """
    Client for fetching data from Google Sheets API.
    
    Simplified version - no rate limiting or request coalescing.
    All calls are made by BackgroundPoller, not by client requests.
    """
    
    BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"
    METADATA_TTL = 300  # 5 minutes for metadata cache
    
    def __init__(self):
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None
        # Cache for metadata (gid → sheet name): key = spreadsheet_id
        self._metadata_cache: dict[str, tuple[dict[str, str], float]] = {}
    
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
    
    async def fetch_metadata(self, spreadsheet_id: str) -> dict[str, str]:
        """
        Fetch spreadsheet metadata (gid → sheet name mapping).
        
        Args:
            spreadsheet_id: Google Sheets document ID
            
        Returns:
            Dict mapping gid to sheet name
            
        Raises:
            GoogleSheetsError: On API errors
        """
        if not self.settings.google_api_key:
            raise GoogleSheetsError(
                "CONFIG_ERROR",
                "Google API key not configured",
                spreadsheet_id
            )
        
        # Check cache first
        cached = self._get_cached_metadata(spreadsheet_id)
        if cached is not None:
            return cached
        
        client = await self._get_client()
        
        url = f"{self.BASE_URL}/{spreadsheet_id}"
        params = {
            "key": self.settings.google_api_key,
            "fields": "sheets.properties(sheetId,title)"  # Only metadata, no data!
        }
        
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as e:
            raise GoogleSheetsError("NETWORK", f"Network error: {e}", spreadsheet_id)
        
        if response.status_code == 404:
            raise GoogleSheetsError("NOT_FOUND", "Spreadsheet not found", spreadsheet_id)
        if response.status_code == 403:
            raise GoogleSheetsError("NOT_PUBLISHED", "Spreadsheet is not public", spreadsheet_id)
        if response.status_code == 429:
            raise GoogleSheetsError("RATE_LIMITED", "Google API rate limit exceeded", spreadsheet_id)
        if not response.is_success:
            raise GoogleSheetsError("API_ERROR", f"Google API error: {response.status_code}", spreadsheet_id)
        
        raw_data = response.json()
        
        # Build gid→name mapping and cache it
        mapping: dict[str, str] = {}
        for sheet in raw_data.get("sheets", []):
            props = sheet.get("properties", {})
            sheet_id = str(props.get("sheetId", 0))
            title = props.get("title", "Sheet")
            mapping[sheet_id] = title
        
        self._cache_metadata(spreadsheet_id, mapping)
        
        return mapping
    
    async def fetch_multiple_sheets(
        self, 
        spreadsheet_id: str, 
        gids: set[str]
    ) -> dict[str, dict[str, Any]]:
        """
        Fetch multiple sheets in one API request.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gids: Set of sheet gids to fetch
            
        Returns:
            Dict mapping gid to sheet data
            
        Raises:
            GoogleSheetsError: On API errors
        """
        if not self.settings.google_api_key:
            raise GoogleSheetsError(
                "CONFIG_ERROR",
                "Google API key not configured",
                spreadsheet_id
            )
        
        if not gids:
            return {}
        
        # Get sheet names from metadata
        metadata = await self.fetch_metadata(spreadsheet_id)
        
        # Build ranges parameter with sheet names
        sheet_names = []
        gid_to_name: dict[str, str] = {}
        for gid in gids:
            name = metadata.get(gid)
            if name:
                sheet_names.append(name)
                gid_to_name[gid] = name
        
        if not sheet_names:
            return {}
        
        client = await self._get_client()
        
        # Fetch all sheets in one request using multiple ranges
        url = f"{self.BASE_URL}/{spreadsheet_id}"
        params = [
            ("key", self.settings.google_api_key),
            ("includeGridData", "true"),
        ]
        # Add each sheet name as a separate ranges parameter
        for name in sheet_names:
            params.append(("ranges", name))
        
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as e:
            raise GoogleSheetsError("NETWORK", f"Network error: {e}", spreadsheet_id)
        
        if response.status_code == 404:
            raise GoogleSheetsError("NOT_FOUND", "Spreadsheet not found", spreadsheet_id)
        if response.status_code == 403:
            raise GoogleSheetsError("NOT_PUBLISHED", "Spreadsheet is not public", spreadsheet_id)
        if response.status_code == 429:
            raise GoogleSheetsError("RATE_LIMITED", "Google API rate limit exceeded", spreadsheet_id)
        if not response.is_success:
            raise GoogleSheetsError("API_ERROR", f"Google API error: {response.status_code}", spreadsheet_id)
        
        raw_data = response.json()
        
        # Parse response and build result dict
        result: dict[str, dict[str, Any]] = {}
        
        for sheet in raw_data.get("sheets", []):
            props = sheet.get("properties", {})
            sheet_gid = str(props.get("sheetId", 0))
            title = props.get("title", "Sheet")
            
            if sheet_gid not in gids:
                continue
            
            grid_data = sheet.get("data", [])
            
            if not grid_data:
                result[sheet_gid] = {
                    "spreadsheetId": spreadsheet_id,
                    "gid": sheet_gid,
                    "title": title,
                    "headers": [],
                    "data": []
                }
                continue
            
            row_data = grid_data[0].get("rowData", [])
            rows = self._extract_rows(row_data)
            
            if not rows:
                result[sheet_gid] = {
                    "spreadsheetId": spreadsheet_id,
                    "gid": sheet_gid,
                    "title": title,
                    "headers": [],
                    "data": []
                }
                continue
            
            # First row is headers, rest is data
            headers = rows[0]
            data_rows = rows[1:] if len(rows) > 1 else []
            
            # Normalize row lengths
            max_cols = max(len(headers), max((len(r) for r in data_rows), default=0))
            
            def normalize_row(row: list) -> list:
                if len(row) < max_cols:
                    return row + [""] * (max_cols - len(row))
                return row
            
            result[sheet_gid] = {
                "spreadsheetId": spreadsheet_id,
                "gid": sheet_gid,
                "title": title,
                "headers": normalize_row(headers),
                "data": [normalize_row(row) for row in data_rows]
            }
        
        return result
    
    def _extract_rows(self, row_data: list[dict]) -> list[list[str]]:
        """Extract cell values from rowData structure."""
        rows = []
        for row in row_data:
            cells = row.get("values", [])
            row_values = []
            for cell in cells:
                value = cell.get("formattedValue", "")
                row_values.append(value if value is not None else "")
            rows.append(row_values)
        return rows


class BackgroundPoller:
    """
    Background task that polls Google Sheets every second.
    
    Features:
    - Only polls when there are active users (activity in last 60 seconds)
    - Groups sheets by spreadsheet_id for efficient fetching
    - One API request per spreadsheet (fetches all subscribed sheets)
    """
    
    POLL_INTERVAL = 1.0  # seconds
    INACTIVITY_TIMEOUT = 60.0  # seconds
    
    def __init__(self, sheets_client: GoogleSheetsClient):
        self._client = sheets_client
        self._cache = None  # Set via set_cache()
        self._subscriptions: dict[str, set[str]] = {}  # spreadsheet_id -> {gid1, gid2}
        self._last_activity: float = 0
        self._task: asyncio.Task | None = None
        self._running = False
    
    def set_cache(self, cache):
        """Set the cache instance (avoids circular import)."""
        self._cache = cache
    
    def subscribe(self, spreadsheet_id: str, gid: str):
        """
        Subscribe a sheet for background polling.
        Also updates last activity time.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID
        """
        if spreadsheet_id not in self._subscriptions:
            self._subscriptions[spreadsheet_id] = set()
        self._subscriptions[spreadsheet_id].add(gid)
        self._last_activity = time.time()
        
        logger.debug(f"Subscribed sheet {spreadsheet_id}:{gid}")
    
    def touch(self):
        """Update last activity time without subscribing."""
        self._last_activity = time.time()
    
    def start(self):
        """Start the background polling loop."""
        if self._running:
            return
        
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Background poller started")
    
    async def stop(self):
        """Stop the background polling loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Background poller stopped")
    
    async def _poll_loop(self):
        """Main polling loop - runs every POLL_INTERVAL seconds."""
        while self._running:
            try:
                await asyncio.sleep(self.POLL_INTERVAL)
                
                # Check if there's been recent activity
                if not self._has_active_users():
                    continue
                
                # Poll all subscribed spreadsheets
                await self._poll_all()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Polling error: {e}")
    
    def _has_active_users(self) -> bool:
        """Check if there was activity within the timeout period."""
        return time.time() - self._last_activity < self.INACTIVITY_TIMEOUT
    
    async def _poll_all(self):
        """Poll all subscribed spreadsheets."""
        if not self._subscriptions or not self._cache:
            return
        
        from app.services.metrics import get_metrics
        metrics = get_metrics()
        
        for spreadsheet_id, gids in self._subscriptions.items():
            if not gids:
                continue
            
            try:
                sheets_data = await self._client.fetch_multiple_sheets(spreadsheet_id, gids)
                
                # Record Google API request for metrics
                metrics.record_google_request(spreadsheet_id)
                
                # Update cache for each sheet
                for gid, data in sheets_data.items():
                    self._cache.set(spreadsheet_id, gid, data)
                    
            except GoogleSheetsError as e:
                logger.warning(f"Failed to fetch {spreadsheet_id}: {e}")
            except Exception as e:
                logger.error(f"Unexpected error polling {spreadsheet_id}: {e}")
    
    @property
    def subscription_count(self) -> int:
        """Get total number of subscribed sheets."""
        return sum(len(gids) for gids in self._subscriptions.values())
    
    @property
    def is_active(self) -> bool:
        """Check if poller is actively polling (has active users)."""
        return self._running and self._has_active_users()


# Singleton instances
_client: GoogleSheetsClient | None = None
_poller: BackgroundPoller | None = None


def get_sheets_client() -> GoogleSheetsClient:
    """Get singleton Google Sheets client."""
    global _client
    if _client is None:
        _client = GoogleSheetsClient()
    return _client


def get_poller() -> BackgroundPoller:
    """Get singleton background poller."""
    global _poller, _client
    if _poller is None:
        if _client is None:
            _client = GoogleSheetsClient()
        _poller = BackgroundPoller(_client)
    return _poller
