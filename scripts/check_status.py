#!/usr/bin/env python3
"""
Status Check Script for OverDraft

Checks the health and status of deployed frontend and API.
Can check both via HTTP and on VPS via SSH.

Usage:
    python check_status.py [--ssh]

Options:
    --ssh    Connect to VPS via SSH and check container/file status
             (requires .env.setup configuration)
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def load_config() -> dict[str, str]:
    """Load configuration from .env.setup file."""
    script_dir = Path(__file__).parent
    env_file = script_dir / ".env.setup"
    
    config = {}
    
    if env_file.exists() and load_dotenv:
        load_dotenv(env_file)
        config["VPS_HOST"] = os.getenv("VPS_HOST", "")
        config["VPS_USER"] = os.getenv("VPS_USER", "root")
        config["SSH_KEY_PATH"] = os.getenv("SSH_KEY_PATH", "")
        config["DOMAIN"] = os.getenv("DOMAIN", "")
    
    return config


def check_http_endpoint(url: str, name: str) -> bool:
    """Check if an HTTP endpoint is responding."""
    logger.info(f"Checking {name}: {url}")
    
    try:
        req = Request(url, headers={"User-Agent": "OverDraft-StatusCheck/1.0"})
        with urlopen(req, timeout=10) as response:
            status = response.status
            data = response.read().decode("utf-8")
            
            if status == 200:
                logger.info(f"  ✓ {name} OK (HTTP {status})")
                try:
                    parsed = json.loads(data)
                    logger.info(f"    Response: {json.dumps(parsed, ensure_ascii=False)[:100]}")
                except json.JSONDecodeError:
                    logger.info(f"    Response: {data[:100]}")
                return True
            else:
                logger.warning(f"  ⚠ {name} returned HTTP {status}")
                return False
                
    except HTTPError as e:
        logger.error(f"  ✗ {name} failed: HTTP {e.code} - {e.reason}")
        return False
    except URLError as e:
        logger.error(f"  ✗ {name} failed: {e.reason}")
        return False
    except Exception as e:
        logger.error(f"  ✗ {name} failed: {e}")
        return False


def check_api_sheets(base_url: str, spreadsheet_id: str = None, gid: str = "0") -> bool:
    """Check the /api/sheets endpoint with a test spreadsheet."""
    if not spreadsheet_id:
        # Use a known public test spreadsheet (Google's sample)
        spreadsheet_id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
    
    url = f"{base_url}/api/sheets?spreadsheetId={spreadsheet_id}&gid={gid}"
    return check_http_endpoint(url, "API Sheets")


def check_frontend(domain: str) -> bool:
    """Check frontend is accessible and returns valid HTML."""
    url = f"https://{domain}"
    logger.info(f"Checking Frontend: {url}")
    
    try:
        req = Request(url, headers={"User-Agent": "OverDraft-StatusCheck/1.0"})
        with urlopen(req, timeout=10) as response:
            status = response.status
            data = response.read().decode("utf-8")
            content_type = response.headers.get("Content-Type", "")
            
            if status == 200 and "text/html" in content_type:
                # Check for key elements in HTML
                has_title = "<title>" in data and "OverDraft" in data
                
                if has_title:
                    logger.info(f"  ✓ Frontend OK (HTTP {status})")
                    return True
                else:
                    logger.warning("  ⚠ HTML loaded but missing expected content")
                    return False
            else:
                logger.warning(f"  ⚠ Unexpected response: {status}, {content_type}")
                return False
                
    except HTTPError as e:
        logger.error(f"  ✗ Frontend failed: HTTP {e.code} - {e.reason}")
        return False
    except URLError as e:
        logger.error(f"  ✗ Frontend failed: {e.reason}")
        return False
    except Exception as e:
        logger.error(f"  ✗ Frontend failed: {e}")
        return False


def check_via_ssh(config: dict[str, str]) -> bool:
    """Connect to VPS via SSH and check container status."""
    try:
        import paramiko
    except ImportError:
        logger.error("paramiko not installed. Run: pip install paramiko")
        return False
    
    host = config.get("VPS_HOST")
    user = config.get("VPS_USER", "root")
    key_path = config.get("SSH_KEY_PATH", "")
    
    if not host:
        logger.error("VPS_HOST not configured in .env.setup")
        return False
    
    logger.info(f"Connecting to {user}@{host}...")
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        key_file = Path(key_path).expanduser() if key_path else None
        if key_file and key_file.exists():
            client.connect(host, username=user, key_filename=str(key_file), timeout=10)
        else:
            logger.warning("SSH key not found, trying without key...")
            client.connect(host, username=user, timeout=10)
        
        logger.info("  ✓ SSH connected")
        
        # Check Docker containers
        logger.info("")
        logger.info("Checking Docker containers...")
        stdin, stdout, stderr = client.exec_command("cd ~/overdraft && docker compose ps --format json")
        output = stdout.read().decode()
        
        if output:
            lines = output.strip().split("\n")
            for line in lines:
                try:
                    container = json.loads(line)
                    name = container.get("Name", container.get("Service", "unknown"))
                    state = container.get("State", container.get("Status", "unknown"))
                    status = container.get("Status", "")
                    
                    if "Up" in state or "running" in state.lower():
                        logger.info(f"  ✓ {name}: {state} {status}")
                    else:
                        logger.warning(f"  ⚠ {name}: {state} {status}")
                except json.JSONDecodeError:
                    logger.info(f"  {line}")
        else:
            logger.warning("  No containers found or docker compose not configured")
        
        # Check local health endpoint
        logger.info("")
        logger.info("Checking local health endpoint...")
        stdin, stdout, stderr = client.exec_command("curl -sf http://localhost:8000/health 2>&1")
        health_output = stdout.read().decode().strip()
        health_error = stderr.read().decode().strip()
        
        if health_output:
            logger.info(f"  ✓ Health: {health_output}")
        else:
            logger.error(f"  ✗ Health check failed: {health_error or 'No response'}")
        
        # Check recent logs
        logger.info("")
        logger.info("Recent API logs (last 5 lines):")
        stdin, stdout, stderr = client.exec_command("cd ~/overdraft && docker compose logs api --tail 5 2>&1")
        logs = stdout.read().decode().strip()
        if logs:
            for line in logs.split("\n"):
                logger.info(f"  {line}")
        
        # Check frontend files
        logger.info("")
        logger.info("Checking frontend files...")
        stdin, stdout, stderr = client.exec_command("ls -la /var/www/overdraft/ 2>&1 | head -5")
        files_output = stdout.read().decode().strip()
        
        if "index.html" in files_output:
            logger.info("  ✓ Frontend files present")
            stdin, stdout, stderr = client.exec_command("find /var/www/overdraft -type f | wc -l")
            count = stdout.read().decode().strip()
            logger.info(f"    Total files: {count}")
        elif "No such file" in files_output:
            logger.warning("  ⚠ /var/www/overdraft/ does not exist")
        else:
            logger.warning("  ⚠ Frontend files missing or not deployed yet")
        
        client.close()
        return True
        
    except paramiko.AuthenticationException:
        logger.error("  ✗ SSH authentication failed")
        return False
    except paramiko.SSHException as e:
        logger.error(f"  ✗ SSH error: {e}")
        return False
    except Exception as e:
        logger.error(f"  ✗ Connection failed: {e}")
        return False
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(description="Check OverDraft frontend and API status")
    parser.add_argument("--ssh", action="store_true", help="Check via SSH on VPS")
    parser.add_argument("--url", type=str, help="Custom API URL to check")
    args = parser.parse_args()
    
    print()
    print("=" * 60)
    print("  OverDraft Status Check")
    print("=" * 60)
    print()
    
    config = load_config()
    all_ok = True
    
    # Determine URLs
    domain = config.get("DOMAIN", "")
    
    if args.url:
        api_url = args.url.rstrip("/")
        frontend_domain = None
    elif domain:
        api_url = f"https://api.{domain}"
        frontend_domain = domain
    elif config.get("VPS_HOST"):
        api_url = f"http://{config['VPS_HOST']}:8000"
        frontend_domain = None
    else:
        logger.error("No URL configured. Use --url or configure .env.setup")
        sys.exit(1)
    
    logger.info(f"API: {api_url}")
    if frontend_domain:
        logger.info(f"Frontend: https://{frontend_domain}")
    print()
    
    # Frontend checks
    if frontend_domain:
        logger.info("-" * 40)
        logger.info("Frontend Checks")
        logger.info("-" * 40)
        
        if not check_frontend(frontend_domain):
            all_ok = False
        print()
    
    # API checks
    logger.info("-" * 40)
    logger.info("API Checks")
    logger.info("-" * 40)
    
    if not check_http_endpoint(f"{api_url}/health", "Health"):
        all_ok = False
    
    print()
    if not check_api_sheets(api_url):
        all_ok = False
    
    # SSH checks (optional)
    if args.ssh:
        print()
        logger.info("-" * 40)
        logger.info("VPS Status (via SSH)")
        logger.info("-" * 40)
        
        if not check_via_ssh(config):
            all_ok = False
    
    # Summary
    print()
    print("=" * 60)
    if all_ok:
        logger.info("✓ All checks passed!")
    else:
        logger.warning("⚠ Some checks failed. Review output above.")
    print("=" * 60)
    
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()

