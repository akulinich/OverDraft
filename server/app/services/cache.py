"""
In-memory cache with TTL and ETag support.
Caches entire spreadsheets by spreadsheet_id for efficient multi-sheet access.
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


@dataclass
class SheetCacheEntry:
    """Cache entry for a specific sheet with its own ETag."""
    headers: list[str]
    data: list[list[str]]
    etag: str


class SpreadsheetCache:
    """
    In-memory cache for spreadsheet data.
    
    Key: spreadsheet_id (string)
    Value: CacheEntry containing all sheets data
    
    This allows fetching entire spreadsheet once and serving
    multiple sheet requests from cache.
    """
    
    def __init__(self):
        self._cache: dict[str, CacheEntry] = {}
        self._settings = get_settings()
    
    @staticmethod
    def compute_etag(data: dict[str, Any]) -> str:
        """
        Compute ETag from data using SHA256.
        
        Returns:
            Quoted ETag string (e.g., '"abc123..."')
        """
        json_str = json.dumps(data, sort_keys=True, ensure_ascii=False)
        hash_value = hashlib.sha256(json_str.encode()).hexdigest()[:16]
        return f'"{hash_value}"'
    
    def get_spreadsheet(self, spreadsheet_id: str) -> CacheEntry | None:
        """
        Get cached spreadsheet if exists and not expired.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            
        Returns:
            CacheEntry if valid cache exists, None otherwise
        """
        entry = self._cache.get(spreadsheet_id)
        
        if entry is None:
            return None
        
        if entry.is_expired():
            del self._cache[spreadsheet_id]
            return None
        
        return entry
    
    def set_spreadsheet(self, spreadsheet_id: str, data: dict[str, Any]) -> CacheEntry:
        """
        Store spreadsheet data in cache.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            data: Full spreadsheet data including all sheets
            
        Returns:
            Created CacheEntry
        """
        etag = self.compute_etag(data)
        expires_at = time.time() + self._settings.cache_ttl
        
        entry = CacheEntry(data=data, etag=etag, expires_at=expires_at)
        self._cache[spreadsheet_id] = entry
        
        return entry
    
    def get_sheet(self, spreadsheet_id: str, gid: str) -> SheetCacheEntry | None:
        """
        Get a specific sheet from cached spreadsheet.
        
        Args:
            spreadsheet_id: Google Sheets document ID
            gid: Sheet tab ID
            
        Returns:
            SheetCacheEntry if found, None otherwise
        """
        entry = self.get_spreadsheet(spreadsheet_id)
        if entry is None:
            return None
        
        sheets = entry.data.get("sheets", {})
        sheet = sheets.get(gid)
        
        if sheet is None:
            return None
        
        # Compute per-sheet ETag (based on sheet content only)
        sheet_data = {"headers": sheet.get("headers", []), "data": sheet.get("data", [])}
        sheet_etag = self.compute_etag(sheet_data)
        
        return SheetCacheEntry(
            headers=sheet.get("headers", []),
            data=sheet.get("data", []),
            etag=sheet_etag
        )
    
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
        """Get number of cached spreadsheets."""
        return len(self._cache)


# Legacy alias for backwards compatibility
SheetCache = SpreadsheetCache


# Singleton instance
_cache: SpreadsheetCache | None = None


def get_cache() -> SpreadsheetCache:
    """Get singleton cache instance."""
    global _cache
    if _cache is None:
        _cache = SpreadsheetCache()
    return _cache
