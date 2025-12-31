"""
In-memory cache with TTL and ETag support.
"""

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any

from app.config import get_settings


@dataclass
class CacheEntry:
    """Single cache entry with data, etag, and expiration."""
    data: dict[str, Any]
    etag: str
    expires_at: float
    
    def is_expired(self) -> bool:
        """Check if entry has expired."""
        return time.time() > self.expires_at


class SheetCache:
    """
    In-memory cache for sheet data.
    
    Key: (spreadsheet_id, gid) tuple
    Value: CacheEntry with data, etag, expires_at
    """
    
    def __init__(self):
        self._cache: dict[tuple[str, str], CacheEntry] = {}
        self._settings = get_settings()
    
    @staticmethod
    def compute_etag(data: dict[str, Any]) -> str:
        """
        Compute ETag from data using SHA256.
        
        Returns:
            Quoted ETag string (e.g., '"abc123..."')
        """
        # Serialize data deterministically
        json_str = json.dumps(data, sort_keys=True, ensure_ascii=False)
        hash_value = hashlib.sha256(json_str.encode()).hexdigest()[:16]
        return f'"{hash_value}"'
    
    def get(self, spreadsheet_id: str, gid: str) -> CacheEntry | None:
        """
        Get cache entry if exists and not expired.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID
            
        Returns:
            CacheEntry if valid cache exists, None otherwise
        """
        key = (spreadsheet_id, gid)
        entry = self._cache.get(key)
        
        if entry is None:
            return None
        
        if entry.is_expired():
            # Clean up expired entry
            del self._cache[key]
            return None
        
        return entry
    
    def set(self, spreadsheet_id: str, gid: str, data: dict[str, Any]) -> CacheEntry:
        """
        Store data in cache with computed ETag.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID
            data: Sheet data to cache
            
        Returns:
            Created CacheEntry
        """
        key = (spreadsheet_id, gid)
        etag = self.compute_etag(data)
        expires_at = time.time() + self._settings.cache_ttl
        
        entry = CacheEntry(data=data, etag=etag, expires_at=expires_at)
        self._cache[key] = entry
        
        return entry
    
    def clear(self):
        """Clear all cache entries."""
        self._cache.clear()
    
    def cleanup_expired(self):
        """Remove all expired entries."""
        now = time.time()
        expired_keys = [
            key for key, entry in self._cache.items()
            if entry.expires_at < now
        ]
        for key in expired_keys:
            del self._cache[key]
    
    def size(self) -> int:
        """Get number of cached entries."""
        return len(self._cache)


# Singleton instance
_cache: SheetCache | None = None


def get_cache() -> SheetCache:
    """Get singleton cache instance."""
    global _cache
    if _cache is None:
        _cache = SheetCache()
    return _cache



