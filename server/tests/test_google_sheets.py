"""
Tests for Google Sheets client with request coalescing.
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
        expected_data = {"headers": ["Name"], "data": [["Alice"]]}
        
        with patch.object(client, "_do_fetch_sheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = expected_data
            
            result = await client.fetch_sheet("spreadsheet123", "0")
            
            assert result == expected_data
            mock_fetch.assert_called_once_with("spreadsheet123", "0")
    
    @pytest.mark.asyncio
    async def test_concurrent_requests_coalesce(self, client):
        """Multiple concurrent requests for same sheet should coalesce into one."""
        expected_data = {"headers": ["Name"], "data": [["Alice"]]}
        call_count = 0
        
        async def slow_fetch(spreadsheet_id: str, gid: str):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.1)  # Simulate API latency
            return expected_data
        
        with patch.object(client, "_do_fetch_sheet", side_effect=slow_fetch):
            # Start 5 concurrent requests
            tasks = [
                asyncio.create_task(client.fetch_sheet("spreadsheet123", "0"))
                for _ in range(5)
            ]
            
            # Wait for all to complete
            results = await asyncio.gather(*tasks)
        
        # All requests should return the same data
        for result in results:
            assert result == expected_data
        
        # But _do_fetch_sheet should only be called once
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_different_sheets_not_coalesced(self, client):
        """Requests for different sheets should not coalesce."""
        expected_data = {"headers": ["Name"], "data": [["Alice"]]}
        call_count = 0
        
        async def slow_fetch(spreadsheet_id: str, gid: str):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return expected_data
        
        with patch.object(client, "_do_fetch_sheet", side_effect=slow_fetch):
            # Start concurrent requests for different sheets
            tasks = [
                asyncio.create_task(client.fetch_sheet("spreadsheet123", "0")),
                asyncio.create_task(client.fetch_sheet("spreadsheet123", "1")),
                asyncio.create_task(client.fetch_sheet("spreadsheet456", "0")),
            ]
            
            await asyncio.gather(*tasks)
        
        # Each unique (spreadsheet_id, gid) should trigger a separate call
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_sequential_requests_not_coalesced(self, client):
        """Sequential requests after completion should trigger new fetches."""
        expected_data = {"headers": ["Name"], "data": [["Alice"]]}
        call_count = 0
        
        async def fast_fetch(spreadsheet_id: str, gid: str):
            nonlocal call_count
            call_count += 1
            return expected_data
        
        with patch.object(client, "_do_fetch_sheet", side_effect=fast_fetch):
            # Make requests sequentially
            await client.fetch_sheet("spreadsheet123", "0")
            await client.fetch_sheet("spreadsheet123", "0")
            await client.fetch_sheet("spreadsheet123", "0")
        
        # Each sequential request should trigger a new fetch
        # (coalescing only works for concurrent requests)
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_error_propagates_to_all_waiters(self, client):
        """If the actual request fails, all waiting requests should get the error."""
        
        async def failing_fetch(spreadsheet_id: str, gid: str):
            await asyncio.sleep(0.1)
            raise GoogleSheetsError("API_ERROR", "Rate limited", spreadsheet_id, gid)
        
        with patch.object(client, "_do_fetch_sheet", side_effect=failing_fetch):
            # Start 3 concurrent requests
            tasks = [
                asyncio.create_task(client.fetch_sheet("spreadsheet123", "0"))
                for _ in range(3)
            ]
            
            # All should fail with the same error
            results = await asyncio.gather(*tasks, return_exceptions=True)
        
        assert len(results) == 3
        for result in results:
            assert isinstance(result, GoogleSheetsError)
            assert "Rate limited" in str(result)
    
    @pytest.mark.asyncio
    async def test_pending_request_cleaned_up_on_success(self, client):
        """Pending request should be removed from tracking after success."""
        expected_data = {"headers": ["Name"], "data": [["Alice"]]}
        
        with patch.object(client, "_do_fetch_sheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = expected_data
            
            await client.fetch_sheet("spreadsheet123", "0")
        
        # Pending requests dict should be empty
        assert len(client._pending_requests) == 0
    
    @pytest.mark.asyncio
    async def test_pending_request_cleaned_up_on_error(self, client):
        """Pending request should be removed from tracking after error."""
        
        with patch.object(client, "_do_fetch_sheet", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.side_effect = GoogleSheetsError("API_ERROR", "Error")
            
            with pytest.raises(GoogleSheetsError):
                await client.fetch_sheet("spreadsheet123", "0")
        
        # Pending requests dict should be empty even after error
        assert len(client._pending_requests) == 0
    
    @pytest.mark.asyncio
    async def test_no_api_key_raises_error(self, client):
        """Missing API key should raise ConfigError without making requests."""
        client.settings.google_api_key = ""
        
        with pytest.raises(GoogleSheetsError) as exc_info:
            await client.fetch_sheet("spreadsheet123", "0")
        
        assert exc_info.value.error_type == "CONFIG_ERROR"

