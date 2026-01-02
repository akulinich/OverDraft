"""
Cache service tests.
"""

import time
import pytest
from unittest.mock import patch

from app.services.cache import SpreadsheetCache


class TestSpreadsheetCache:
    """Tests for SpreadsheetCache."""
    
    @pytest.fixture
    def cache(self):
        """Create a cache instance with 60 second TTL."""
        with patch("app.services.cache.get_settings") as mock:
            mock.return_value.cache_ttl = 60
            yield SpreadsheetCache()
    
    def test_set_and_get_spreadsheet(self, cache):
        """Should store and retrieve spreadsheet data."""
        data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Sheet1", "headers": ["A"], "data": [["1"]]}
            }
        }
        
        cache.set_spreadsheet("test123", data)
        entry = cache.get_spreadsheet("test123")
        
        assert entry is not None
        assert entry.data == data
        assert entry.etag.startswith('"')
        assert entry.etag.endswith('"')
    
    def test_get_spreadsheet_missing(self, cache):
        """Should return None for missing spreadsheet."""
        result = cache.get_spreadsheet("nonexistent")
        assert result is None
    
    def test_get_sheet_from_cached_spreadsheet(self, cache):
        """Should extract specific sheet from cached spreadsheet."""
        data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Players", "headers": ["Name"], "data": [["Alice"]]},
                "123": {"title": "Teams", "headers": ["Team"], "data": [["Team1"]]}
            }
        }
        
        cache.set_spreadsheet("test123", data)
        
        sheet = cache.get_sheet("test123", "0")
        assert sheet is not None
        assert sheet.headers == ["Name"]
        assert sheet.data == [["Alice"]]
        
        sheet2 = cache.get_sheet("test123", "123")
        assert sheet2 is not None
        assert sheet2.headers == ["Team"]
    
    def test_get_sheet_not_found(self, cache):
        """Should return None if sheet gid doesn't exist."""
        data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Sheet1", "headers": [], "data": []}
            }
        }
        
        cache.set_spreadsheet("test123", data)
        
        result = cache.get_sheet("test123", "999")
        assert result is None
    
    def test_get_sheet_spreadsheet_not_cached(self, cache):
        """Should return None if spreadsheet not cached."""
        result = cache.get_sheet("nonexistent", "0")
        assert result is None
    
    def test_etag_deterministic(self, cache):
        """Same data should produce same ETag."""
        data = {"test": "value"}
        
        etag1 = cache.compute_etag(data)
        etag2 = cache.compute_etag(data)
        
        assert etag1 == etag2
    
    def test_different_data_different_etag(self, cache):
        """Different data should produce different ETag."""
        etag1 = cache.compute_etag({"test": "value1"})
        etag2 = cache.compute_etag({"test": "value2"})
        
        assert etag1 != etag2
    
    def test_sheet_has_own_etag(self, cache):
        """Each sheet should have its own ETag based on content."""
        data = {
            "spreadsheetId": "test123",
            "sheets": {
                "0": {"title": "Sheet1", "headers": ["A"], "data": [["1"]]},
                "1": {"title": "Sheet2", "headers": ["B"], "data": [["2"]]}
            }
        }
        
        cache.set_spreadsheet("test123", data)
        
        sheet1 = cache.get_sheet("test123", "0")
        sheet2 = cache.get_sheet("test123", "1")
        
        assert sheet1.etag != sheet2.etag
    
    def test_expired_returns_none(self, cache):
        """Expired entries should return None."""
        data = {"spreadsheetId": "test", "sheets": {}}
        cache.set_spreadsheet("test123", data)
        
        # Manually expire the entry
        cache._cache["test123"].expires_at = time.time() - 1
        
        result = cache.get_spreadsheet("test123")
        assert result is None
    
    def test_expired_entry_removed(self, cache):
        """Getting expired entry should remove it from cache."""
        data = {"spreadsheetId": "test", "sheets": {}}
        cache.set_spreadsheet("test123", data)
        cache._cache["test123"].expires_at = time.time() - 1
        
        cache.get_spreadsheet("test123")
        
        assert "test123" not in cache._cache
    
    def test_cleanup_expired(self, cache):
        """cleanup_expired should remove all expired entries."""
        cache.set_spreadsheet("a", {"spreadsheetId": "a", "sheets": {}})
        cache.set_spreadsheet("b", {"spreadsheetId": "b", "sheets": {}})
        cache.set_spreadsheet("c", {"spreadsheetId": "c", "sheets": {}})
        
        # Expire a and c
        cache._cache["a"].expires_at = time.time() - 1
        cache._cache["c"].expires_at = time.time() - 1
        
        cache.cleanup_expired()
        
        assert cache.size() == 1
        assert cache.get_spreadsheet("b") is not None
    
    def test_clear(self, cache):
        """clear should remove all entries."""
        cache.set_spreadsheet("a", {"spreadsheetId": "a", "sheets": {}})
        cache.set_spreadsheet("b", {"spreadsheetId": "b", "sheets": {}})
        
        cache.clear()
        
        assert cache.size() == 0
    
    def test_size(self, cache):
        """size should return number of cached spreadsheets."""
        assert cache.size() == 0
        
        cache.set_spreadsheet("a", {"spreadsheetId": "a", "sheets": {}})
        assert cache.size() == 1
        
        cache.set_spreadsheet("b", {"spreadsheetId": "b", "sheets": {}})
        assert cache.size() == 2
