"""
Simple request metrics tracking.
Thread-safe counters for monitoring API usage.
"""

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from time import time
from typing import Any


# Maximum timestamps to keep for rolling window (covers ~17 min at 100 req/s)
MAX_TIMESTAMPS = 100000


@dataclass
class Metrics:
    """Request metrics container with thread-safe counters."""
    
    google_api_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    errors: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    per_sheet: dict[str, int] = field(default_factory=dict)
    
    # Rolling window timestamps for RPM calculation
    _request_times: deque = field(default_factory=lambda: deque(maxlen=MAX_TIMESTAMPS))
    _google_request_times: deque = field(default_factory=lambda: deque(maxlen=MAX_TIMESTAMPS))
    
    _lock: Lock = field(default_factory=Lock, repr=False)
    
    def record_google_request(self, spreadsheet_id: str) -> None:
        """Record a request to Google Sheets API."""
        with self._lock:
            self.google_api_requests += 1
            self._google_request_times.append(time())
            # Use truncated ID as key for readability
            key = spreadsheet_id[:12] + "..." if len(spreadsheet_id) > 12 else spreadsheet_id
            self.per_sheet[key] = self.per_sheet.get(key, 0) + 1
    
    def record_cache_hit(self) -> None:
        """Record a cache hit (data served from cache)."""
        with self._lock:
            self.cache_hits += 1
            self._request_times.append(time())
    
    def record_cache_miss(self) -> None:
        """Record a cache miss (data fetched from Google)."""
        with self._lock:
            self.cache_misses += 1
            self._request_times.append(time())
    
    def record_error(self) -> None:
        """Record an API error."""
        with self._lock:
            self.errors += 1
    
    def _count_in_window(self, timestamps: deque, window_seconds: int) -> int:
        """Count timestamps within the last N seconds."""
        cutoff = time() - window_seconds
        count = 0
        # Iterate from newest to oldest (right to left)
        for t in reversed(timestamps):
            if t > cutoff:
                count += 1
            else:
                break  # Older timestamps won't match
        return count
    
    def get_server_rpm(self) -> float:
        """Get server requests per minute (last 60 seconds)."""
        with self._lock:
            count = self._count_in_window(self._request_times, 60)
            return round(count, 1)
    
    def get_google_rpm(self) -> float:
        """Get Google API requests per minute (last 60 seconds)."""
        with self._lock:
            count = self._count_in_window(self._google_request_times, 60)
            return round(count, 1)
    
    def to_dict(self) -> dict[str, Any]:
        """Export metrics as dictionary."""
        with self._lock:
            now = datetime.now(timezone.utc)
            uptime = (now - self.started_at).total_seconds()
            total_requests = self.cache_hits + self.cache_misses
            
            # Calculate RPM (requests in last 60 seconds)
            server_rpm = self._count_in_window(self._request_times, 60)
            google_rpm = self._count_in_window(self._google_request_times, 60)
            
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
                "server_rpm": server_rpm,
                "google_rpm": google_rpm,
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
            self._request_times.clear()
            self._google_request_times.clear()
            self.started_at = datetime.now(timezone.utc)


# Singleton instance
_metrics: Metrics | None = None


def get_metrics() -> Metrics:
    """Get singleton metrics instance."""
    global _metrics
    if _metrics is None:
        _metrics = Metrics()
    return _metrics
