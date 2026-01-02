"""
Tests for Google Sheets client with background polling.
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.google_sheets import GoogleSheetsClient, GoogleSheetsError, BackgroundPoller


class TestGoogleSheetsClient:
    """Tests for GoogleSheetsClient."""
    
    @pytest.fixture
    def client(self):
        """Create a GoogleSheetsClient with mocked settings."""
        with patch("app.services.google_sheets.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(google_api_key="test_key")
            client = GoogleSheetsClient()
            yield client
    
    @pytest.mark.asyncio
    async def test_fetch_multiple_sheets_success(self, client):
        """Should fetch multiple sheets in one request."""
        # Mock metadata
        client._cache_metadata("test123", {"0": "Sheet1", "123": "Sheet2"})
        
        # Mock HTTP response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {
            "sheets": [
                {
                    "properties": {"sheetId": 0, "title": "Sheet1"},
                    "data": [{"rowData": [
                        {"values": [{"formattedValue": "Name"}]},
                        {"values": [{"formattedValue": "Alice"}]}
                    ]}]
                },
                {
                    "properties": {"sheetId": 123, "title": "Sheet2"},
                    "data": [{"rowData": [
                        {"values": [{"formattedValue": "Team"}]},
                        {"values": [{"formattedValue": "Alpha"}]}
                    ]}]
                }
            ]
        }
        
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        
        with patch.object(client, "_get_client", return_value=mock_client):
            result = await client.fetch_multiple_sheets("test123", {"0", "123"})
        
        assert "0" in result
        assert "123" in result
        assert result["0"]["headers"] == ["Name"]
        assert result["0"]["data"] == [["Alice"]]
        assert result["123"]["headers"] == ["Team"]
        assert result["123"]["data"] == [["Alpha"]]
    
    @pytest.mark.asyncio
    async def test_fetch_multiple_sheets_no_api_key(self, client):
        """Should raise error when no API key configured."""
        client.settings.google_api_key = ""
        
        with pytest.raises(GoogleSheetsError) as exc_info:
            await client.fetch_multiple_sheets("test123", {"0"})
        
        assert exc_info.value.error_type == "CONFIG_ERROR"
    
    @pytest.mark.asyncio
    async def test_fetch_multiple_sheets_empty_gids(self, client):
        """Should return empty dict for empty gids."""
        result = await client.fetch_multiple_sheets("test123", set())
        assert result == {}


class TestMetadataCaching:
    """Tests for metadata caching behavior."""
    
    @pytest.fixture
    def client(self):
        """Create a GoogleSheetsClient with mocked settings."""
        with patch("app.services.google_sheets.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(google_api_key="test_key")
            client = GoogleSheetsClient()
            yield client
    
    def test_cache_metadata(self, client):
        """Should cache metadata correctly."""
        mapping = {"0": "Sheet1", "123": "Sheet2"}
        
        client._cache_metadata("test123", mapping)
        
        result = client._get_cached_metadata("test123")
        assert result == mapping
    
    def test_cache_miss(self, client):
        """Should return None for uncached spreadsheet."""
        result = client._get_cached_metadata("nonexistent")
        assert result is None
    
    def test_cache_expiration(self, client):
        """Should return None for expired cache."""
        mapping = {"0": "Sheet1"}
        client._cache_metadata("test123", mapping)
        
        # Expire the cache manually
        client._metadata_cache["test123"] = (mapping, time.time() - 1)
        
        result = client._get_cached_metadata("test123")
        assert result is None


class TestBackgroundPoller:
    """Tests for BackgroundPoller."""
    
    @pytest.fixture
    def poller(self):
        """Create a BackgroundPoller with mocked client."""
        with patch("app.services.google_sheets.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(google_api_key="test_key")
            client = GoogleSheetsClient()
            poller = BackgroundPoller(client)
            yield poller
    
    def test_subscribe_adds_sheet(self, poller):
        """Should add sheet to subscriptions."""
        poller.subscribe("test123", "0")
        
        assert "test123" in poller._subscriptions
        assert "0" in poller._subscriptions["test123"]
    
    def test_subscribe_updates_activity(self, poller):
        """Should update last activity time."""
        old_time = poller._last_activity
        
        poller.subscribe("test123", "0")
        
        assert poller._last_activity > old_time
    
    def test_subscribe_multiple_sheets(self, poller):
        """Should track multiple sheets per spreadsheet."""
        poller.subscribe("test123", "0")
        poller.subscribe("test123", "123")
        poller.subscribe("test456", "0")
        
        assert len(poller._subscriptions["test123"]) == 2
        assert len(poller._subscriptions["test456"]) == 1
    
    def test_subscription_count(self, poller):
        """Should count total subscriptions."""
        poller.subscribe("test123", "0")
        poller.subscribe("test123", "123")
        poller.subscribe("test456", "0")
        
        assert poller.subscription_count == 3
    
    def test_has_active_users_true(self, poller):
        """Should return True when there was recent activity."""
        poller.touch()
        assert poller._has_active_users() is True
    
    def test_has_active_users_false(self, poller):
        """Should return False when no recent activity."""
        poller._last_activity = time.time() - 120  # 2 minutes ago
        assert poller._has_active_users() is False
    
    def test_is_active_when_running_and_users(self, poller):
        """Should be active when running and has users."""
        poller._running = True
        poller.touch()
        assert poller.is_active is True
    
    def test_is_active_false_when_not_running(self, poller):
        """Should not be active when not running."""
        poller._running = False
        poller.touch()
        assert poller.is_active is False
    
    @pytest.mark.asyncio
    async def test_start_creates_task(self, poller):
        """Should create polling task when started."""
        poller.start()
        
        assert poller._running is True
        assert poller._task is not None
        
        await poller.stop()
    
    @pytest.mark.asyncio
    async def test_stop_cancels_task(self, poller):
        """Should cancel polling task when stopped."""
        poller.start()
        await poller.stop()
        
        assert poller._running is False
    
    @pytest.mark.asyncio
    async def test_poll_all_updates_cache(self, poller):
        """Should update cache when polling."""
        # Set up mock cache
        mock_cache = MagicMock()
        poller.set_cache(mock_cache)
        
        # Subscribe to a sheet
        poller.subscribe("test123", "0")
        
        # Mock the client's fetch_multiple_sheets
        mock_data = {
            "0": {
                "spreadsheetId": "test123",
                "gid": "0",
                "title": "Sheet1",
                "headers": ["Name"],
                "data": [["Alice"]]
            }
        }
        
        with patch.object(poller._client, "fetch_multiple_sheets", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = mock_data
            
            await poller._poll_all()
        
        mock_cache.set.assert_called_once_with("test123", "0", mock_data["0"])


class TestRowExtraction:
    """Tests for extracting rows from sheet data."""
    
    @pytest.fixture
    def client(self):
        """Create a GoogleSheetsClient with mocked settings."""
        with patch("app.services.google_sheets.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(google_api_key="test_key")
            client = GoogleSheetsClient()
            yield client
    
    def test_extract_rows_basic(self, client):
        """Should extract cell values from rowData."""
        row_data = [
            {"values": [{"formattedValue": "A"}, {"formattedValue": "B"}]},
            {"values": [{"formattedValue": "1"}, {"formattedValue": "2"}]}
        ]
        
        result = client._extract_rows(row_data)
        
        assert result == [["A", "B"], ["1", "2"]]
    
    def test_extract_rows_empty_cells(self, client):
        """Should handle empty cells."""
        row_data = [
            {"values": [{"formattedValue": "A"}, {}]},
            {"values": [{}]}
        ]
        
        result = client._extract_rows(row_data)
        
        assert result == [["A", ""], [""]]
    
    def test_extract_rows_none_values(self, client):
        """Should handle None formattedValue."""
        row_data = [
            {"values": [{"formattedValue": None}, {"formattedValue": "B"}]}
        ]
        
        result = client._extract_rows(row_data)
        
        assert result == [["", "B"]]
