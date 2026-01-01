"""
Simple request metrics tracking.
Thread-safe counters for monitoring API usage.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any


@dataclass
class Metrics:
    """Request metrics container with thread-safe counters."""
    
    google_api_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    errors: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    per_sheet: dict[str, int] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock, repr=False)
    
    def record_google_request(self, spreadsheet_id: str) -> None:
        """Record a request to Google Sheets API."""
        with self._lock:
            self.google_api_requests += 1
            # Use truncated ID as key for readability
            key = spreadsheet_id[:12] + "..." if len(spreadsheet_id) > 12 else spreadsheet_id
            self.per_sheet[key] = self.per_sheet.get(key, 0) + 1
    
    def record_cache_hit(self) -> None:
        """Record a cache hit (data served from cache)."""
        with self._lock:
            self.cache_hits += 1
    
    def record_cache_miss(self) -> None:
        """Record a cache miss (data fetched from Google)."""
        with self._lock:
            self.cache_misses += 1
    
    def record_error(self) -> None:
        """Record an API error."""
        with self._lock:
            self.errors += 1
    
    def to_dict(self) -> dict[str, Any]:
        """Export metrics as dictionary."""
        with self._lock:
            now = datetime.now(timezone.utc)
            uptime = (now - self.started_at).total_seconds()
            total_requests = self.cache_hits + self.cache_misses
            
            return {
                "uptime_seconds": int(uptime),
                "started_at": self.started_at.isoformat(),
                "google_api_requests": self.google_api_requests,
                "cache_hits": self.cache_hits,
                "cache_misses": self.cache_misses,
                "total_requests": total_requests,
                "cache_hit_rate_percent": round(
                    self.cache_hits / max(1, total_requests) * 100, 1
                ),
                "errors": self.errors,
                "requests_per_sheet": dict(self.per_sheet)
            }
    
    def reset(self) -> None:
        """Reset all counters."""
        with self._lock:
            self.google_api_requests = 0
            self.cache_hits = 0
            self.cache_misses = 0
            self.errors = 0
            self.per_sheet.clear()
            self.started_at = datetime.now(timezone.utc)


# Singleton instance
_metrics: Metrics | None = None


def get_metrics() -> Metrics:
    """Get singleton metrics instance."""
    global _metrics
    if _metrics is None:
        _metrics = Metrics()
    return _metrics

