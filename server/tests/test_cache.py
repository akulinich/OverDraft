"""
Cache service tests.
"""

import time
import pytest
from unittest.mock import patch

from app.services.cache import SheetCache


class TestSheetCache:
    """Tests for SheetCache."""
    
    @pytest.fixture
    def cache(self):
        """Create a cache instance with 60 second TTL."""
        with patch("app.services.cache.get_settings") as mock:
            mock.return_value.cache_ttl = 60
            yield SheetCache()
    
    def test_set_and_get(self, cache):
        """Should store and retrieve sheet data."""
        data = {
            "spreadsheetId": "test123",
            "gid": "0",
            "title": "Sheet1",
            "headers": ["A"],
            "data": [["1"]]
        }
        
        cache.set("test123", "0", data)
        entry = cache.get("test123", "0")
        
        assert entry is not None
        assert entry.data == data
        assert entry.etag.startswith('"')
        assert entry.etag.endswith('"')
    
    def test_get_missing(self, cache):
        """Should return None for missing sheet."""
        result = cache.get("nonexistent", "0")
        assert result is None
    
    def test_different_gids_stored_separately(self, cache):
        """Should store different gids separately."""
        data1 = {"spreadsheetId": "test123", "gid": "0", "headers": ["A"], "data": [["1"]]}
        data2 = {"spreadsheetId": "test123", "gid": "1", "headers": ["B"], "data": [["2"]]}
        
        cache.set("test123", "0", data1)
        cache.set("test123", "1", data2)
        
        entry1 = cache.get("test123", "0")
        entry2 = cache.get("test123", "1")
        
        assert entry1 is not None
        assert entry2 is not None
        assert entry1.data["headers"] == ["A"]
        assert entry2.data["headers"] == ["B"]
    
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
    
    def test_expired_returns_none(self, cache):
        """Expired entries should return None."""
        data = {"spreadsheetId": "test", "gid": "0", "headers": [], "data": []}
        cache.set("test123", "0", data)
        
        # Manually expire the entry
        cache._cache[("test123", "0")].expires_at = time.time() - 1
        
        result = cache.get("test123", "0")
        assert result is None
    
    def test_expired_entry_removed(self, cache):
        """Getting expired entry should remove it from cache."""
        data = {"spreadsheetId": "test", "gid": "0", "headers": [], "data": []}
        cache.set("test123", "0", data)
        cache._cache[("test123", "0")].expires_at = time.time() - 1
        
        cache.get("test123", "0")
        
        assert ("test123", "0") not in cache._cache
    
    def test_cleanup_expired(self, cache):
        """cleanup_expired should remove all expired entries."""
        cache.set("a", "0", {"headers": [], "data": []})
        cache.set("b", "0", {"headers": [], "data": []})
        cache.set("c", "0", {"headers": [], "data": []})
        
        # Expire a and c
        cache._cache[("a", "0")].expires_at = time.time() - 1
        cache._cache[("c", "0")].expires_at = time.time() - 1
        
        cache.cleanup_expired()
        
        assert cache.size() == 1
        assert cache.get("b", "0") is not None
    
    def test_clear(self, cache):
        """clear should remove all entries."""
        cache.set("a", "0", {"headers": [], "data": []})
        cache.set("b", "0", {"headers": [], "data": []})
        
        cache.clear()
        
        assert cache.size() == 0
    
    def test_size(self, cache):
        """size should return number of cached sheets."""
        assert cache.size() == 0
        
        cache.set("a", "0", {"headers": [], "data": []})
        assert cache.size() == 1
        
        cache.set("b", "0", {"headers": [], "data": []})
        assert cache.size() == 2
