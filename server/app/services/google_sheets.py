"""
Google Sheets API client.
Fetches entire spreadsheet data in a single API call using includeGridData=true.
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
    
    Fetches entire spreadsheet in one request using includeGridData=true.
    Implements request coalescing: if multiple requests come in for the same
    spreadsheet while a Google API request is already in-flight, they all wait
    for the same response instead of triggering new API requests.
    """
    
    BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"
    
    def __init__(self):
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None
        # Track in-flight requests for coalescing (by spreadsheet_id only)
        self._pending_requests: dict[str, asyncio.Task] = {}
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    async def fetch_spreadsheet(self, spreadsheet_id: str) -> dict[str, Any]:
        """
        Fetch entire spreadsheet with all sheets in one API call.
        
        Uses includeGridData=true to get metadata and cell values together.
        Implements request coalescing for concurrent requests.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            
        Returns:
            dict with sheets data:
            {
                "spreadsheetId": "...",
                "sheets": {
                    "0": {"title": "Sheet1", "headers": [...], "data": [...]},
                    "123": {"title": "Sheet2", "headers": [...], "data": [...]}
                }
            }
            
        Raises:
            GoogleSheetsError: On API errors
        """
        if not self.settings.google_api_key:
            raise GoogleSheetsError(
                "CONFIG_ERROR",
                "Google API key not configured",
                spreadsheet_id,
                ""
            )
        
        # Check if request is already in-flight
        if spreadsheet_id in self._pending_requests:
            # Wait for the existing request
            return await self._pending_requests[spreadsheet_id]
        
        # Create new request task
        task = asyncio.create_task(self._do_fetch_spreadsheet(spreadsheet_id))
        self._pending_requests[spreadsheet_id] = task
        
        try:
            return await task
        finally:
            # Clean up after completion (success or failure)
            self._pending_requests.pop(spreadsheet_id, None)
    
    async def _do_fetch_spreadsheet(self, spreadsheet_id: str) -> dict[str, Any]:
        """
        Actually perform the fetch from Google Sheets API.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            
        Returns:
            Parsed spreadsheet data with all sheets
        """
        client = await self._get_client()
        
        url = f"{self.BASE_URL}/{spreadsheet_id}"
        params = {
            "key": self.settings.google_api_key,
            "includeGridData": "true"
        }
        
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as e:
            raise GoogleSheetsError(
                "NETWORK",
                f"Network error: {e}",
                spreadsheet_id,
                ""
            )
        
        if response.status_code == 404:
            raise GoogleSheetsError(
                "NOT_FOUND",
                "Spreadsheet not found",
                spreadsheet_id,
                ""
            )
        
        if response.status_code == 403:
            raise GoogleSheetsError(
                "NOT_PUBLISHED",
                "Spreadsheet is not public",
                spreadsheet_id,
                ""
            )
        
        if response.status_code == 429:
            raise GoogleSheetsError(
                "RATE_LIMITED",
                "Google API rate limit exceeded",
                spreadsheet_id,
                ""
            )
        
        if not response.is_success:
            raise GoogleSheetsError(
                "API_ERROR",
                f"Google API error: {response.status_code}",
                spreadsheet_id,
                ""
            )
        
        raw_data = response.json()
        return self._parse_spreadsheet_response(spreadsheet_id, raw_data)
    
    def _parse_spreadsheet_response(
        self, 
        spreadsheet_id: str, 
        raw_data: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Parse the raw Google Sheets API response into our format.
        
        Args:
            spreadsheet_id: Spreadsheet ID
            raw_data: Raw response from Google API
            
        Returns:
            Parsed data with sheets indexed by gid
        """
        result = {
            "spreadsheetId": spreadsheet_id,
            "sheets": {}
        }
        
        for sheet in raw_data.get("sheets", []):
            props = sheet.get("properties", {})
            sheet_id = str(props.get("sheetId", 0))
            title = props.get("title", "Sheet")
            
            # Extract grid data
            grid_data = sheet.get("data", [])
            if not grid_data:
                result["sheets"][sheet_id] = {
                    "title": title,
                    "headers": [],
                    "data": []
                }
                continue
            
            # Parse row data from first grid (usually the only one)
            row_data = grid_data[0].get("rowData", [])
            rows = self._extract_rows(row_data)
            
            if not rows:
                result["sheets"][sheet_id] = {
                    "title": title,
                    "headers": [],
                    "data": []
                }
                continue
            
            # First row is headers, rest is data
            headers = rows[0] if rows else []
            data_rows = rows[1:] if len(rows) > 1 else []
            
            # Normalize row lengths
            max_cols = max(len(headers), max((len(r) for r in data_rows), default=0))
            
            def normalize_row(row: list) -> list:
                if len(row) < max_cols:
                    return row + [""] * (max_cols - len(row))
                return row
            
            result["sheets"][sheet_id] = {
                "title": title,
                "headers": normalize_row(headers),
                "data": [normalize_row(row) for row in data_rows]
            }
        
        return result
    
    def _extract_rows(self, row_data: list[dict]) -> list[list[str]]:
        """
        Extract cell values from rowData structure.
        
        Args:
            row_data: List of row objects from Google API
            
        Returns:
            List of rows, each row is a list of string values
        """
        rows = []
        
        for row in row_data:
            cells = row.get("values", [])
            row_values = []
            
            for cell in cells:
                # Get formatted value (what user sees in the spreadsheet)
                value = cell.get("formattedValue", "")
                row_values.append(value if value is not None else "")
            
            rows.append(row_values)
        
        return rows
    
    def get_sheet_from_spreadsheet(
        self, 
        spreadsheet_data: dict[str, Any], 
        gid: str
    ) -> dict[str, Any] | None:
        """
        Extract a specific sheet from cached spreadsheet data.
        
        Args:
            spreadsheet_data: Full spreadsheet data from fetch_spreadsheet
            gid: Sheet ID to extract
            
        Returns:
            Sheet data or None if not found
        """
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
    
    # Legacy method for backwards compatibility
    async def fetch_sheet(self, spreadsheet_id: str, gid: str) -> dict[str, Any]:
        """
        Fetch a specific sheet (legacy interface).
        
        Internally fetches entire spreadsheet and extracts the requested sheet.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID
            
        Returns:
            dict with headers and data arrays
            
        Raises:
            GoogleSheetsError: On API errors or if sheet not found
        """
        spreadsheet_data = await self.fetch_spreadsheet(spreadsheet_id)
        sheet = self.get_sheet_from_spreadsheet(spreadsheet_data, gid)
        
        if sheet is None:
            raise GoogleSheetsError(
                "NOT_FOUND",
                f"Sheet with gid={gid} not found",
                spreadsheet_id,
                gid
            )
        
        return sheet


# Singleton instance
_client: GoogleSheetsClient | None = None


def get_sheets_client() -> GoogleSheetsClient:
    """Get singleton Google Sheets client."""
    global _client
    if _client is None:
        _client = GoogleSheetsClient()
    return _client
