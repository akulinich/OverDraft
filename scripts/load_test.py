#!/usr/bin/env python3
"""
Load Testing Script for OverDraft API

Uses Locust for load testing with realistic user simulation.
Simulates multiple users polling Google Sheets data.

Usage:
    # With Web UI (recommended for first run)
    python load_test.py --host http://localhost:8000
    
    # Headless mode with 100 users
    python load_test.py --host http://localhost:8000 --users 100 --headless
    
    # Against VPS
    python load_test.py --host https://your-vps-domain.com --users 50 --headless

Requirements:
    pip install locust

Web UI available at http://localhost:8089 when running without --headless
"""

import argparse
import os
import random
import sys
from pathlib import Path

try:
    from locust import HttpUser, task, between, events
    from locust.env import Environment
    from locust.runners import MasterRunner
    from locust.log import setup_logging
    from locust import run_single_user
    import gevent
except ImportError:
    print("ERROR: locust is not installed.")
    print("Install with: pip install locust")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


# =============================================================================
# Configuration
# =============================================================================

# Default test spreadsheet (can be overridden with env vars)
DEFAULT_SPREADSHEET_ID = "1b-KhzrlrvNikk9fp5URYQglHE1cOly9ME-NitQdMKBs"
DEFAULT_GID = "1506748454"

def load_config():
    """Load configuration from dev.env if available."""
    script_dir = Path(__file__).parent
    env_file = script_dir / "dev.env"
    
    if env_file.exists() and load_dotenv:
        load_dotenv(env_file)
    
    return {
        "spreadsheet_id": os.getenv("TEST_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID),
        "gid": os.getenv("TEST_GID", DEFAULT_GID),
    }


# Load config at module level for Locust
CONFIG = load_config()


# =============================================================================
# User Classes
# =============================================================================

class OverDraftUser(HttpUser):
    """
    Simulates a realistic OverDraft user polling for sheet data.
    
    Behavior:
    - Polls sheet data every 3-10 seconds (simulates polling interval)
    - Uses ETag for conditional requests (reduces bandwidth)
    - Each user has unique fake IP (for rate limiting testing)
    """
    
    # Wait between 3-10 seconds between requests (realistic polling)
    wait_time = between(3, 10)
    
    def on_start(self):
        """Called when user starts. Initialize state."""
        # Unique fake IP for each user (bypasses per-IP rate limiting)
        self.fake_ip = f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"
        self.etag = None
        self.request_count = 0
        self.cache_hits = 0
    
    @task(10)
    def poll_sheet(self):
        """
        Main task: Poll the sheet data with ETag support.
        This simulates real client behavior with conditional requests.
        """
        headers = {
            "X-Forwarded-For": self.fake_ip
        }
        if self.etag:
            headers["If-None-Match"] = self.etag
        
        with self.client.get(
            f"/api/sheets?spreadsheetId={CONFIG['spreadsheet_id']}&gid={CONFIG['gid']}",
            headers=headers,
            catch_response=True,
            name="/api/sheets"
        ) as response:
            self.request_count += 1
            
            if response.status_code == 200:
                # New data received
                self.etag = response.headers.get("ETag")
                response.success()
            elif response.status_code == 304:
                # Not modified - cache hit (expected behavior)
                self.cache_hits += 1
                response.success()
            elif response.status_code == 429:
                # Rate limited
                response.failure("Rate limited (429)")
            else:
                response.failure(f"Unexpected status: {response.status_code}")
    
    @task(1)
    def check_health(self):
        """Occasional health check (10% of traffic)."""
        self.client.get("/health", name="/health")
    
    @task(1)
    def check_stats(self):
        """Occasional stats check (10% of traffic)."""
        self.client.get("/stats", name="/stats")
    
    def on_stop(self):
        """Called when user stops. Log summary."""
        if self.request_count > 0:
            cache_rate = (self.cache_hits / self.request_count) * 100
            # This info is aggregated by Locust


class AggressiveUser(HttpUser):
    """
    Aggressive user for stress testing.
    Polls every 1-2 seconds without ETag (worst case scenario).
    """
    
    wait_time = between(1, 2)
    
    def on_start(self):
        self.fake_ip = f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"
    
    @task
    def poll_sheet_no_cache(self):
        """Fast polling without ETag (cache-busting)."""
        headers = {"X-Forwarded-For": self.fake_ip}
        
        with self.client.get(
            f"/api/sheets?spreadsheetId={CONFIG['spreadsheet_id']}&gid={CONFIG['gid']}",
            headers=headers,
            catch_response=True,
            name="/api/sheets (aggressive)"
        ) as response:
            if response.status_code in [200, 304]:
                response.success()
            elif response.status_code == 429:
                response.failure("Rate limited")
            else:
                response.failure(f"Status: {response.status_code}")


class RateLimitTestUser(HttpUser):
    """
    User for testing rate limiting.
    All users share the same IP to trigger rate limits.
    """
    
    wait_time = between(0.1, 0.5)  # Very fast
    
    # Shared IP for all users of this type
    SHARED_IP = "192.168.100.1"
    
    @task
    def trigger_rate_limit(self):
        """Rapid requests to trigger rate limiting."""
        headers = {"X-Forwarded-For": self.SHARED_IP}
        
        with self.client.get(
            f"/api/sheets?spreadsheetId={CONFIG['spreadsheet_id']}&gid={CONFIG['gid']}",
            headers=headers,
            catch_response=True,
            name="/api/sheets (rate-limit-test)"
        ) as response:
            if response.status_code == 429:
                # This is expected for this test
                response.success()
            elif response.status_code in [200, 304]:
                response.success()
            else:
                response.failure(f"Status: {response.status_code}")


# =============================================================================
# Event Handlers
# =============================================================================

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when test starts."""
    print("\n" + "=" * 60)
    print("OverDraft Load Test Starting")
    print("=" * 60)
    print(f"Target: {environment.host}")
    print(f"Spreadsheet: {CONFIG['spreadsheet_id']}")
    print(f"GID: {CONFIG['gid']}")
    print("=" * 60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when test stops."""
    print("\n" + "=" * 60)
    print("Load Test Complete")
    print("=" * 60)
    
    # Print summary stats
    stats = environment.stats
    if stats.total.num_requests > 0:
        print(f"Total Requests: {stats.total.num_requests}")
        print(f"Failures: {stats.total.num_failures}")
        print(f"Avg Response Time: {stats.total.avg_response_time:.2f}ms")
        print(f"RPS: {stats.total.current_rps:.2f}")
        if stats.total.num_failures > 0:
            failure_rate = (stats.total.num_failures / stats.total.num_requests) * 100
            print(f"Failure Rate: {failure_rate:.2f}%")
    print("=" * 60 + "\n")


# =============================================================================
# CLI
# =============================================================================

def main():
    """Main entry point with custom CLI."""
    parser = argparse.ArgumentParser(
        description="OverDraft Load Testing Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode with Web UI
  python load_test.py --host http://localhost:8000
  
  # Headless mode: 100 users, spawn 10/sec, run 5 minutes
  python load_test.py --host http://localhost:8000 --users 100 --spawn-rate 10 --run-time 5m --headless
  
  # Test against production VPS
  python load_test.py --host https://your-vps.com --users 50 --headless
  
  # Aggressive stress test
  python load_test.py --host http://localhost:8000 --users 20 --user-class aggressive --headless
  
  # Rate limit test
  python load_test.py --host http://localhost:8000 --users 10 --user-class rate-limit --headless

User Classes:
  normal      - Realistic users with 3-10s polling interval (default)
  aggressive  - Fast polling every 1-2s without ETag
  rate-limit  - All users share same IP to test rate limiting
        """
    )
    
    parser.add_argument(
        "--host", "-H",
        required=True,
        help="Target host URL (e.g., http://localhost:8000)"
    )
    parser.add_argument(
        "--users", "-u",
        type=int,
        default=10,
        help="Number of concurrent users (default: 10)"
    )
    parser.add_argument(
        "--spawn-rate", "-r",
        type=float,
        default=5,
        help="Users to spawn per second (default: 5)"
    )
    parser.add_argument(
        "--run-time", "-t",
        default=None,
        help="Run time, e.g., '5m', '1h' (default: until stopped)"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run without Web UI"
    )
    parser.add_argument(
        "--user-class",
        choices=["normal", "aggressive", "rate-limit"],
        default="normal",
        help="User behavior class (default: normal)"
    )
    parser.add_argument(
        "--web-port",
        type=int,
        default=8089,
        help="Web UI port (default: 8089)"
    )
    
    args = parser.parse_args()
    
    # Select user class
    user_classes = {
        "normal": OverDraftUser,
        "aggressive": AggressiveUser,
        "rate-limit": RateLimitTestUser,
    }
    user_class = user_classes[args.user_class]
    
    # Build locust command
    locust_args = [
        "-f", __file__,
        "--host", args.host,
        "--users", str(args.users),
        "--spawn-rate", str(args.spawn_rate),
        "--web-port", str(args.web_port),
    ]
    
    if args.run_time:
        locust_args.extend(["--run-time", args.run_time])
    
    if args.headless:
        locust_args.append("--headless")
    
    # Set the user class via environment
    os.environ["LOCUST_USER_CLASS"] = args.user_class
    
    # Run locust with subprocess to properly handle all arguments
    import subprocess
    
    cmd = [
        sys.executable, "-m", "locust",
        "-f", __file__,
        "--host", args.host,
        "--users", str(args.users),
        "--spawn-rate", str(args.spawn_rate),
    ]
    
    if args.run_time:
        cmd.extend(["--run-time", args.run_time])
    
    if args.headless:
        cmd.append("--headless")
    else:
        cmd.extend(["--web-port", str(args.web_port)])
        print(f"\nWeb UI will be available at: http://localhost:{args.web_port}")
    
    # Filter to only the selected user class
    if args.user_class != "normal":
        class_name = user_class.__name__
        cmd.extend(["--class-picker"])
    
    print(f"\nStarting load test with {args.users} {args.user_class} users...")
    print(f"Target: {args.host}\n")
    
    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
    except subprocess.CalledProcessError as e:
        print(f"\nLocust exited with error: {e.returncode}")
        sys.exit(e.returncode)


if __name__ == "__main__":
    main()


