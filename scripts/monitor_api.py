#!/usr/bin/env python3
"""
Monitor OverDraft API statistics from local machine.

Usage:
    python monitor_api.py [API_URL] [INTERVAL]
    
Examples:
    python monitor_api.py
    python monitor_api.py https://api.example.com
    python monitor_api.py https://api.example.com 10
"""

import sys
import time
from datetime import datetime

try:
    import httpx
except ImportError:
    print("Error: httpx not installed. Run: pip install httpx")
    sys.exit(1)


DEFAULT_API_URL = "https://api.overdraft.live"
DEFAULT_INTERVAL = 5  # seconds


def format_duration(seconds: int) -> str:
    """Format seconds as human-readable duration."""
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours}h {minutes}m"


def main():
    api_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_API_URL
    interval = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_INTERVAL
    
    stats_url = f"{api_url.rstrip('/')}/stats"
    
    print(f"Monitoring: {stats_url}")
    print(f"Interval: {interval}s")
    print("-" * 70)
    print(f"{'Time':<10} {'Uptime':<10} {'Google':<12} {'Cache':<20} {'Hit%':<8}")
    print("-" * 70)
    
    prev_google = None
    
    while True:
        try:
            resp = httpx.get(stats_url, timeout=10)
            
            if resp.status_code != 200:
                print(f"[ERROR] HTTP {resp.status_code}")
                time.sleep(interval)
                continue
                
            data = resp.json()
            
            now = datetime.now().strftime("%H:%M:%S")
            uptime = format_duration(data.get("uptime_seconds", 0))
            google = data.get("google_api_requests", 0)
            hits = data.get("cache_hits", 0)
            misses = data.get("cache_misses", 0)
            hit_rate = data.get("cache_hit_rate_percent", 0)
            
            # Calculate delta since last check
            delta = ""
            if prev_google is not None:
                diff = google - prev_google
                if diff > 0:
                    delta = f" (+{diff})"
            prev_google = google
            
            cache_str = f"{hits}/{misses}"
            google_str = f"{google}{delta}"
            
            print(f"{now:<10} {uptime:<10} {google_str:<12} {cache_str:<20} {hit_rate:<8.1f}")
            
        except httpx.ConnectError:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Connection failed")
        except httpx.TimeoutException:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Timeout")
        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as e:
            print(f"[ERROR] {e}")
        
        time.sleep(interval)


if __name__ == "__main__":
    main()

