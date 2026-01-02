"""
Google Sheets API client.
Fetches data from public Google Sheets using the official API.
Includes request coalescing to prevent duplicate API calls.
"""

import asyncio
import httpx
from typing import Any

from app.config import get_settings


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
    
    Implements request coalescing: if multiple requests come in for the same
    sheet while a Google API request is already in-flight, they all wait for
    the same response instead of triggering new API requests.
    """
    
    BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"
    
    def __init__(self):
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None
        # Track in-flight requests for coalescing
        self._pending_requests: dict[tuple[str, str], asyncio.Task] = {}
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    async def fetch_sheet(self, spreadsheet_id: str, gid: str) -> dict[str, Any]:
        """
        Fetch sheet data from Google Sheets API with request coalescing.
        
        If a request for the same sheet is already in progress, waits for
        that request instead of starting a new one. This prevents duplicate
        API calls when multiple clients request the same data simultaneously.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID (numeric)
            
        Returns:
            dict with headers and data arrays
            
        Raises:
            GoogleSheetsError: On API errors
        """
        if not self.settings.google_api_key:
            raise GoogleSheetsError(
                "CONFIG_ERROR",
                "Google API key not configured",
                spreadsheet_id,
                gid
            )
        
        key = (spreadsheet_id, gid)
        
        # Check if request is already in-flight
        if key in self._pending_requests:
            # Wait for the existing request
            return await self._pending_requests[key]
        
        # Create new request task
        task = asyncio.create_task(self._do_fetch_sheet(spreadsheet_id, gid))
        self._pending_requests[key] = task
        
        try:
            return await task
        finally:
            # Clean up after completion (success or failure)
            self._pending_requests.pop(key, None)
    
    async def _do_fetch_sheet(self, spreadsheet_id: str, gid: str) -> dict[str, Any]:
        """
        Actually perform the fetch from Google Sheets API.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID (numeric)
            
        Returns:
            dict with headers and data arrays
        """
        # First, get sheet metadata to find sheet name by gid
        sheet_name = await self._get_sheet_name(spreadsheet_id, gid)
        
        # Then fetch the actual data
        return await self._fetch_values(spreadsheet_id, gid, sheet_name)
    
    async def _get_sheet_name(self, spreadsheet_id: str, gid: str) -> str:
        """Get sheet name by gid from spreadsheet metadata."""
        client = await self._get_client()
        
        url = f"{self.BASE_URL}/{spreadsheet_id}"
        params = {
            "key": self.settings.google_api_key,
            "fields": "sheets(properties(sheetId,title))"
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
            raise GoogleSheetsError(
                "NOT_FOUND",
                "Spreadsheet not found",
                spreadsheet_id,
                gid
            )
        
        if response.status_code == 403:
            raise GoogleSheetsError(
                "NOT_PUBLISHED",
                "Spreadsheet is not public",
                spreadsheet_id,
                gid
            )
        
        if not response.is_success:
            raise GoogleSheetsError(
                "API_ERROR",
                f"Google API error: {response.status_code}",
                spreadsheet_id,
                gid
            )
        
        data = response.json()
        gid_int = int(gid)
        
        for sheet in data.get("sheets", []):
            props = sheet.get("properties", {})
            if props.get("sheetId") == gid_int:
                return props.get("title", "Sheet1")
        
        raise GoogleSheetsError(
            "NOT_FOUND",
            f"Sheet with gid={gid} not found",
            spreadsheet_id,
            gid
        )
    
    async def _fetch_values(
        self, 
        spreadsheet_id: str, 
        gid: str, 
        sheet_name: str
    ) -> dict[str, Any]:
        """Fetch cell values from a specific sheet."""
        client = await self._get_client()
        
        # URL-encode sheet name for the range
        encoded_name = sheet_name.replace("'", "''")
        range_param = f"'{encoded_name}'"
        
        url = f"{self.BASE_URL}/{spreadsheet_id}/values/{range_param}"
        params = {
            "key": self.settings.google_api_key,
            "valueRenderOption": "FORMATTED_VALUE",
            "dateTimeRenderOption": "FORMATTED_STRING"
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
        
        if not response.is_success:
            raise GoogleSheetsError(
                "API_ERROR",
                f"Failed to fetch values: {response.status_code}",
                spreadsheet_id,
                gid
            )
        
        data = response.json()
        values = data.get("values", [])
        
        if not values:
            return {
                "spreadsheetId": spreadsheet_id,
                "gid": gid,
                "headers": [],
                "data": []
            }
        
        # First row is headers, rest is data
        headers = values[0] if values else []
        rows = values[1:] if len(values) > 1 else []
        
        # Find max column count (needed when first row is empty)
        max_cols = len(headers)
        for row in rows:
            if len(row) > max_cols:
                max_cols = len(row)
        
        # Normalize all rows to max column count
        def normalize_row(row: list) -> list:
            if len(row) < max_cols:
                return row + [""] * (max_cols - len(row))
            return row
        
        headers = normalize_row(headers)
        normalized_rows = [normalize_row(row) for row in rows]
        
        return {
            "spreadsheetId": spreadsheet_id,
            "gid": gid,
            "headers": headers,
            "data": normalized_rows
        }


# Singleton instance
_client: GoogleSheetsClient | None = None


def get_sheets_client() -> GoogleSheetsClient:
    """Get singleton Google Sheets client."""
    global _client
    if _client is None:
        _client = GoogleSheetsClient()
    return _client



