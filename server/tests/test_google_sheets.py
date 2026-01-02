"""
Tests for Google Sheets client with request coalescing and single-request optimization.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.google_sheets import GoogleSheetsClient, GoogleSheetsError


class TestRequestCoalescing:
    """Tests for request coalescing behavior."""
    
    @pytest.fixture
    def client(self):
        """Create a GoogleSheetsClient with mocked settings."""
        with patch("app.services.google_sheets.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(google_api_key="test_key")
            client = GoogleSheetsClient()
            yield client
    
    @pytest.mark.asyncio
    async def test_single_request_works(self, client):
        """Single request should work normally."""
        expected_data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Sheet1", "headers": ["Name"], "data": [["Alice"]]}
            }
        }
        
        with patch.object(client, "_do_fetch_spreadsheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = expected_data
            
            result = await client.fetch_spreadsheet("test123")
            
            assert result == expected_data
            mock_fetch.assert_called_once_with("test123")
    
    @pytest.mark.asyncio
    async def test_concurrent_requests_coalesce(self, client):
        """Multiple concurrent requests for same spreadsheet should coalesce into one."""
        expected_data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Sheet1", "headers": ["Name"], "data": [["Alice"]]}
            }
        }
        call_count = 0
        
        async def slow_fetch(spreadsheet_id: str):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.1)
            return expected_data
        
        with patch.object(client, "_do_fetch_spreadsheet", side_effect=slow_fetch):
            # Start 5 concurrent requests
            tasks = [
                asyncio.create_task(client.fetch_spreadsheet("test123"))
                for _ in range(5)
            ]
            
            results = await asyncio.gather(*tasks)
        
        # All requests should return the same data
        for result in results:
            assert result == expected_data
        
        # But _do_fetch_spreadsheet should only be called once
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_different_spreadsheets_not_coalesced(self, client):
        """Requests for different spreadsheets should not coalesce."""
        expected_data = {
            "spreadsheetId": "test",
            "sheets": {}
        }
        call_count = 0
        
        async def slow_fetch(spreadsheet_id: str):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return {**expected_data, "spreadsheetId": spreadsheet_id}
        
        with patch.object(client, "_do_fetch_spreadsheet", side_effect=slow_fetch):
            tasks = [
                asyncio.create_task(client.fetch_spreadsheet("spreadsheet1")),
                asyncio.create_task(client.fetch_spreadsheet("spreadsheet2")),
                asyncio.create_task(client.fetch_spreadsheet("spreadsheet3")),
            ]
            
            await asyncio.gather(*tasks)
        
        # Each unique spreadsheet_id should trigger a separate call
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_error_propagates_to_all_waiters(self, client):
        """If the actual request fails, all waiting requests should get the error."""
        
        async def failing_fetch(spreadsheet_id: str):
            await asyncio.sleep(0.1)
            raise GoogleSheetsError("API_ERROR", "Rate limited", spreadsheet_id, "")
        
        with patch.object(client, "_do_fetch_spreadsheet", side_effect=failing_fetch):
            tasks = [
                asyncio.create_task(client.fetch_spreadsheet("test123"))
                for _ in range(3)
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
        
        assert len(results) == 3
        for result in results:
            assert isinstance(result, GoogleSheetsError)
            assert "Rate limited" in str(result)
    
    @pytest.mark.asyncio
    async def test_pending_request_cleaned_up_on_success(self, client):
        """Pending request should be removed from tracking after success."""
        expected_data = {"spreadsheetId": "test", "sheets": {}}
        
        with patch.object(client, "_do_fetch_spreadsheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = expected_data
            
            await client.fetch_spreadsheet("test123")
        
        assert len(client._pending_requests) == 0
    
    @pytest.mark.asyncio
    async def test_pending_request_cleaned_up_on_error(self, client):
        """Pending request should be removed from tracking after error."""
        
        with patch.object(client, "_do_fetch_spreadsheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.side_effect = GoogleSheetsError("API_ERROR", "Error")
            
            with pytest.raises(GoogleSheetsError):
                await client.fetch_spreadsheet("test123")
        
        assert len(client._pending_requests) == 0
    
    @pytest.mark.asyncio
    async def test_no_api_key_raises_error(self, client):
        """Missing API key should raise ConfigError without making requests."""
        client.settings.google_api_key = ""
        
        with pytest.raises(GoogleSheetsError) as exc_info:
            await client.fetch_spreadsheet("test123")
        
        assert exc_info.value.error_type == "CONFIG_ERROR"


class TestSheetExtraction:
    """Tests for extracting specific sheets from spreadsheet data."""
    
    @pytest.fixture
    def client(self):
        """Create a GoogleSheetsClient with mocked settings."""
        with patch("app.services.google_sheets.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(google_api_key="test_key")
            client = GoogleSheetsClient()
            yield client
    
    def test_get_sheet_from_spreadsheet_found(self, client):
        """Should extract sheet by gid when it exists."""
        spreadsheet_data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Players", "headers": ["Name", "Role"], "data": [["Alice", "Tank"]]},
                "123": {"title": "Teams", "headers": ["Team"], "data": [["Team1"]]}
            }
        }
        
        result = client.get_sheet_from_spreadsheet(spreadsheet_data, "0")
        
        assert result is not None
        assert result["gid"] == "0"
        assert result["title"] == "Players"
        assert result["headers"] == ["Name", "Role"]
        assert result["data"] == [["Alice", "Tank"]]
    
    def test_get_sheet_from_spreadsheet_not_found(self, client):
        """Should return None when gid doesn't exist."""
        spreadsheet_data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Sheet1", "headers": [], "data": []}
            }
        }
        
        result = client.get_sheet_from_spreadsheet(spreadsheet_data, "999")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_fetch_sheet_legacy_interface(self, client):
        """Legacy fetch_sheet should work by fetching spreadsheet and extracting."""
        spreadsheet_data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Players", "headers": ["Name"], "data": [["Bob"]]}
            }
        }
        
        with patch.object(client, "fetch_spreadsheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = spreadsheet_data
            
            result = await client.fetch_sheet("test123", "0")
        
        assert result["headers"] == ["Name"]
        assert result["data"] == [["Bob"]]
    
    @pytest.mark.asyncio
    async def test_fetch_sheet_not_found_raises_error(self, client):
        """Legacy fetch_sheet should raise error if gid not found."""
        spreadsheet_data = {
            "spreadsheetId": "test123",
            "sheets": {}
        }
        
        with patch.object(client, "fetch_spreadsheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = spreadsheet_data
            
            with pytest.raises(GoogleSheetsError) as exc_info:
                await client.fetch_sheet("test123", "999")
        
        assert exc_info.value.error_type == "NOT_FOUND"


class TestResponseParsing:
    """Tests for parsing Google Sheets API response format."""
    
    @pytest.fixture
    def client(self):
        """Create a GoogleSheetsClient with mocked settings."""
        with patch("app.services.google_sheets.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(google_api_key="test_key")
            client = GoogleSheetsClient()
            yield client
    
    def test_parse_empty_spreadsheet(self, client):
        """Should handle spreadsheet with no sheets."""
        raw_data = {"sheets": []}
        
        result = client._parse_spreadsheet_response("test123", raw_data)
        
        assert result["spreadsheetId"] == "test123"
        assert result["sheets"] == {}
    
    def test_parse_sheet_with_data(self, client):
        """Should parse sheet with grid data."""
        raw_data = {
            "sheets": [
                {
                    "properties": {"sheetId": 0, "title": "Sheet1"},
                    "data": [
                        {
                            "rowData": [
                                {"values": [{"formattedValue": "Name"}, {"formattedValue": "Age"}]},
                                {"values": [{"formattedValue": "Alice"}, {"formattedValue": "30"}]},
                                {"values": [{"formattedValue": "Bob"}, {"formattedValue": "25"}]}
                            ]
                        }
                    ]
                }
            ]
        }
        
        result = client._parse_spreadsheet_response("test123", raw_data)
        
        sheet = result["sheets"]["0"]
        assert sheet["title"] == "Sheet1"
        assert sheet["headers"] == ["Name", "Age"]
        assert sheet["data"] == [["Alice", "30"], ["Bob", "25"]]
    
    def test_parse_multiple_sheets(self, client):
        """Should parse multiple sheets."""
        raw_data = {
            "sheets": [
                {
                    "properties": {"sheetId": 0, "title": "Players"},
                    "data": [{"rowData": [{"values": [{"formattedValue": "Name"}]}]}]
                },
                {
                    "properties": {"sheetId": 123456, "title": "Teams"},
                    "data": [{"rowData": [{"values": [{"formattedValue": "Team"}]}]}]
                }
            ]
        }
        
        result = client._parse_spreadsheet_response("test123", raw_data)
        
        assert "0" in result["sheets"]
        assert "123456" in result["sheets"]
        assert result["sheets"]["0"]["title"] == "Players"
        assert result["sheets"]["123456"]["title"] == "Teams"
    
    def test_parse_normalizes_row_lengths(self, client):
        """Should normalize rows to same length."""
        raw_data = {
            "sheets": [
                {
                    "properties": {"sheetId": 0, "title": "Sheet1"},
                    "data": [
                        {
                            "rowData": [
                                {"values": [{"formattedValue": "A"}, {"formattedValue": "B"}, {"formattedValue": "C"}]},
                                {"values": [{"formattedValue": "1"}]},  # Short row
                                {"values": [{"formattedValue": "X"}, {"formattedValue": "Y"}]}  # Medium row
                            ]
                        }
                    ]
                }
            ]
        }
        
        result = client._parse_spreadsheet_response("test123", raw_data)
        
        sheet = result["sheets"]["0"]
        assert sheet["headers"] == ["A", "B", "C"]
        assert sheet["data"][0] == ["1", "", ""]  # Padded
        assert sheet["data"][1] == ["X", "Y", ""]  # Padded
    
    def test_parse_empty_cells(self, client):
        """Should handle empty/missing cells."""
        raw_data = {
            "sheets": [
                {
                    "properties": {"sheetId": 0, "title": "Sheet1"},
                    "data": [
                        {
                            "rowData": [
                                {"values": [{"formattedValue": "A"}, {}, {"formattedValue": "C"}]},
                                {"values": []}
                            ]
                        }
                    ]
                }
            ]
        }
        
        result = client._parse_spreadsheet_response("test123", raw_data)
        
        sheet = result["sheets"]["0"]
        assert sheet["headers"] == ["A", "", "C"]
