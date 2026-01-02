"""
SheetCache unit tests.
"""

import time
from unittest.mock import patch, MagicMock

import pytest


class TestSheetCache:
    """Tests for SheetCache class."""
    
    @pytest.fixture
    def cache(self):
        """Create fresh cache instance with mocked settings."""
        with patch("app.services.cache.get_settings") as mock:
            mock.return_value = MagicMock(cache_ttl=1)  # 1 second TTL
            from app.services.cache import SheetCache
            return SheetCache()
    
    def test_set_and_get(self, cache):
        """Cache stores and retrieves data correctly."""
        data = {"headers": ["A"], "data": []}
        cache.set("sheet1", "0", data)
        assert cache.get("sheet1", "0").data == data
    
    def test_get_missing(self, cache):
        """Getting non-existent key returns None."""
        assert cache.get("missing", "0") is None
    
    def test_etag_deterministic(self, cache):
        """Same data produces same ETag."""
        data = {"headers": ["X"], "data": []}
        assert cache.compute_etag(data) == cache.compute_etag(data)
    
    def test_different_data_different_etag(self, cache):
        """Different data produces different ETag."""
        data1 = {"headers": ["A"], "data": []}
        data2 = {"headers": ["B"], "data": []}
        assert cache.compute_etag(data1) != cache.compute_etag(data2)
    
    def test_expired_returns_none(self, cache):
        """Expired entries are not returned."""
        cache.set("sheet1", "0", {"headers": [], "data": []})
        time.sleep(1.1)
        assert cache.get("sheet1", "0") is None
    
    def test_cleanup_expired(self, cache):
        """cleanup_expired removes stale entries."""
        cache.set("s1", "0", {"headers": [], "data": []})
        assert cache.size() == 1
        time.sleep(1.1)
        cache.cleanup_expired()
        assert cache.size() == 0
    
    def test_clear(self, cache):
        """clear removes all entries."""
        cache.set("sheet1", "0", {"headers": [], "data": []})
        cache.set("sheet2", "0", {"headers": [], "data": []})
        cache.clear()
        assert cache.size() == 0
    
    def test_size(self, cache):
        """size returns correct count."""
        assert cache.size() == 0
        cache.set("s1", "0", {"headers": [], "data": []})
        assert cache.size() == 1
        cache.set("s2", "0", {"headers": [], "data": []})
        assert cache.size() == 2


