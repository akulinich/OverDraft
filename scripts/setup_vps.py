#!/usr/bin/env python3
"""
VPS Setup Script for OverDraft API Server

This script automates the initial setup of a VPS for running the OverDraft API.
It connects via SSH and configures everything needed for deployment.

Each step checks if it's already completed and skips if so.
Config files are checked for expected content - if outdated, user is prompted to update.
On any failure, the script stops and shows manual instructions.

Configuration:
    Copy env.setup.example to .env.setup and fill in all values.
    All parameters including secrets are read from .env.setup.

Usage:
    pip install -r requirements.txt
    python setup_vps.py
"""

import getpass
import logging
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

try:
    import paramiko
except ImportError:
    print("Error: paramiko is required. Install with: pip install paramiko")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("Error: python-dotenv is required. Install with: pip install python-dotenv")
    sys.exit(1)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# Manual instructions for each step
MANUAL_INSTRUCTIONS = {
    "connect": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: SSH Connection Failed                               ║
╠══════════════════════════════════════════════════════════════════╣
║  1. Check that VPS is running in Hetzner Console                 ║
║  2. Verify SSH key exists:                                       ║
║     > dir ~/.ssh/                                                ║
║  3. If no key, create one:                                       ║
║     > ssh-keygen -t ed25519                                      ║
║  4. Try connecting manually:                                     ║
║     > ssh root@YOUR_VPS_IP                                       ║
║  5. If password required, use password from Hetzner email        ║
║  6. Add your SSH key to VPS:                                     ║
║     (on VPS) nano ~/.ssh/authorized_keys                         ║
║     Paste your public key from: cat ~/.ssh/id_ed25519.pub        ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "update_system": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: System Update Failed                                ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  sudo apt update && sudo apt upgrade -y                          ║
║                                                                  ║
║  If you see lock errors, wait a minute and try again.            ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "install_docker": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: Docker Installation Failed                          ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  curl -fsSL https://get.docker.com | sudo sh                     ║
║  sudo usermod -aG docker $USER                                   ║
║  newgrp docker                                                   ║
║  sudo apt install -y docker-compose-plugin                       ║
║                                                                  ║
║  Verify with:                                                    ║
║  docker --version                                                ║
║  docker compose version                                          ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "create_directory": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: Directory Creation Failed                           ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  mkdir -p ~/overdraft                                            ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "create_docker_compose": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: docker-compose.yml Creation Failed                  ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  nano ~/overdraft/docker-compose.yml                             ║
║                                                                  ║
║  Paste the following (replace YOUR_GITHUB_USERNAME):             ║
║  ─────────────────────────────────────────────────────────────── ║
║  services:                                                       ║
║    api:                                                          ║
║      image: ghcr.io/YOUR_GITHUB_USERNAME/overdraft-api:latest    ║
║      user: "0:0"                                                 ║
║      expose:                                                     ║
║        - "8000"                                                  ║
║      env_file:                                                   ║
║        - .env                                                    ║
║      volumes:                                                    ║
║        - config_data:/app/data/configs                           ║
║      restart: unless-stopped                                     ║
║                                                                  ║
║    caddy:                                                        ║
║      image: caddy:2-alpine                                       ║
║      ports:                                                      ║
║        - "80:80"                                                 ║
║        - "443:443"                                               ║
║      volumes:                                                    ║
║        - ./Caddyfile:/etc/caddy/Caddyfile:ro                     ║
║        - caddy_data:/data                                        ║
║        - caddy_config:/config                                    ║
║      depends_on:                                                 ║
║        - api                                                     ║
║      restart: unless-stopped                                     ║
║                                                                  ║
║  volumes:                                                        ║
║    caddy_data:                                                   ║
║    caddy_config:                                                 ║
║    config_data:                                                  ║
║  ─────────────────────────────────────────────────────────────── ║
║  Save: Ctrl+O, Enter, Ctrl+X                                     ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "create_env": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: .env File Creation Failed                           ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  nano ~/overdraft/.env                                           ║
║                                                                  ║
║  Add the following:                                              ║
║  ─────────────────────────────────────────────────────────────── ║
║  GOOGLE_API_KEY=your_google_api_key_here                         ║
║  CACHE_TTL=1                                                     ║
║  CORS_ORIGINS=["https://yourdomain.com"]                         ║
║  RATE_LIMIT=60/minute                                            ║
║  CONFIG_STORAGE_PATH=/app/data/configs                           ║
║  ─────────────────────────────────────────────────────────────── ║
║  Save: Ctrl+O, Enter, Ctrl+X                                     ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "create_caddyfile": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: Caddyfile Creation Failed                           ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  nano ~/overdraft/Caddyfile                                      ║
║                                                                  ║
║  Add the following (replace YOUR_DOMAIN):                        ║
║  ─────────────────────────────────────────────────────────────── ║
║  YOUR_DOMAIN {{                                                   ║
║      reverse_proxy api:8000                                      ║
║      encode gzip                                                 ║
║  }}                                                               ║
║  ─────────────────────────────────────────────────────────────── ║
║  Save: Ctrl+O, Enter, Ctrl+X                                     ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "configure_firewall": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: Firewall Configuration Failed                       ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  sudo ufw allow OpenSSH                                          ║
║  sudo ufw allow 80                                               ║
║  sudo ufw allow 443                                              ║
║  sudo ufw --force enable                                         ║
║  sudo ufw status                                                 ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "login_ghcr": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: GHCR Login Failed                                   ║
╠══════════════════════════════════════════════════════════════════╣
║  1. Create a Personal Access Token (PAT) at:                     ║
║     GitHub → Settings → Developer settings →                     ║
║     Personal access tokens → Tokens (classic)                    ║
║                                                                  ║
║  2. Select scope: read:packages                                  ║
║                                                                  ║
║  3. SSH to your VPS and run:                                     ║
║     echo "YOUR_PAT" | docker login ghcr.io \\                     ║
║       -u YOUR_GITHUB_USERNAME --password-stdin                   ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "pull_and_start": """
╔══════════════════════════════════════════════════════════════════╗
║  INFO: Container Pull/Start                                      ║
╠══════════════════════════════════════════════════════════════════╣
║  The Docker image doesn't exist yet - this is normal!            ║
║                                                                  ║
║  After your first push to main branch, run on VPS:               ║
║                                                                  ║
║  cd ~/overdraft                                                  ║
║  docker compose pull                                             ║
║  docker compose up -d                                            ║
║                                                                  ║
║  Verify:                                                         ║
║  docker compose ps                                               ║
║  curl http://localhost:8000/health                               ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "github_secrets": """
╔══════════════════════════════════════════════════════════════════╗
║  NEXT STEP: Configure GitHub Secrets                             ║
╠══════════════════════════════════════════════════════════════════╣
║  Go to your repository:                                          ║
║  Settings → Secrets and variables → Actions → New secret         ║
║                                                                  ║
║  Add these secrets:                                              ║
║  ┌─────────────┬────────────────────────────────────────────┐    ║
║  │ VPS_HOST    │ Your VPS IP address                        │    ║
║  │ VPS_USER    │ root                                       │    ║
║  │ VPS_SSH_KEY │ Content of ~/.ssh/id_ed25519 (PRIVATE key) │    ║
║  └─────────────┴────────────────────────────────────────────┘    ║
║                                                                  ║
║  To get private key, run locally:                                ║
║  cat ~/.ssh/id_ed25519                                           ║
║                                                                  ║
║  Copy EVERYTHING including -----BEGIN and -----END lines         ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "dns_setup": """
╔══════════════════════════════════════════════════════════════════╗
║  NEXT STEP: Configure DNS                                        ║
╠══════════════════════════════════════════════════════════════════╣
║  In your domain registrar's DNS settings, add an A record:       ║
║                                                                  ║
║  ┌──────┬──────────────────┬─────────────────────────────┐       ║
║  │ Type │ Name             │ Value                       │       ║
║  ├──────┼──────────────────┼─────────────────────────────┤       ║
║  │ A    │ api (or subdomain)│ YOUR_VPS_IP                │       ║
║  └──────┴──────────────────┴─────────────────────────────┘       ║
║                                                                  ║
║  Wait 5-10 minutes for DNS propagation.                          ║
║  Check with: dig YOUR_DOMAIN                                     ║
╚══════════════════════════════════════════════════════════════════╝
""",
    "fix_config_permissions": """
╔══════════════════════════════════════════════════════════════════╗
║  MANUAL FIX: Config Directory Permissions                        ║
╠══════════════════════════════════════════════════════════════════╣
║  SSH to your VPS and run:                                        ║
║                                                                  ║
║  cd ~/overdraft                                                  ║
║  docker compose exec api mkdir -p /app/data/configs              ║
║  docker compose exec api chmod 777 /app/data/configs             ║
║                                                                  ║
║  Verify:                                                         ║
║  docker compose exec api touch /app/data/configs/test.txt        ║
║  docker compose exec api rm /app/data/configs/test.txt           ║
╚══════════════════════════════════════════════════════════════════╝
""",
}


@dataclass
class VPSConfig:
    """Configuration for VPS setup."""
    host: str
    username: str
    ssh_key_path: str
    github_username: str
    github_pat: str
    google_api_key: str
    domain: str | None = None
    cache_ttl: int = 1  # seconds
    cors_origins: list[str] | None = None
    rate_limit: str = "60/minute"


class VPSSetup:
    """Handles VPS setup via SSH."""

    def __init__(self, config: VPSConfig):
        self.config = config
        self.client: paramiko.SSHClient | None = None

    def connect(self) -> bool:
        """Establish SSH connection to VPS."""
        logger.info(f"Connecting to {self.config.host} as {self.config.username}...")
        
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            key_path = Path(self.config.ssh_key_path).expanduser()
            if key_path.exists():
                logger.info(f"Using SSH key: {key_path}")
                self.client.connect(
                    self.config.host,
                    username=self.config.username,
                    key_filename=str(key_path),
                    timeout=30,
                )
            else:
                logger.warning(f"SSH key not found at {key_path}, trying password auth...")
                password = getpass.getpass(f"Password for {self.config.username}@{self.config.host}: ")
                self.client.connect(
                    self.config.host,
                    username=self.config.username,
                    password=password,
                    timeout=30,
                )
            
            logger.info("✓ Connected successfully")
            return True
            
        except paramiko.AuthenticationException:
            logger.error("✗ Authentication failed")
            print(MANUAL_INSTRUCTIONS["connect"])
            return False
        except paramiko.SSHException as e:
            logger.error(f"✗ SSH error: {e}")
            print(MANUAL_INSTRUCTIONS["connect"])
            return False
        except Exception as e:
            logger.error(f"✗ Connection failed: {e}")
            print(MANUAL_INSTRUCTIONS["connect"])
            return False

    def disconnect(self):
        """Close SSH connection."""
        if self.client:
            self.client.close()
            logger.info("Disconnected from VPS")

    def run_command(self, command: str, check: bool = True, sudo: bool = False) -> tuple[int, str, str]:
        """Execute a command on the VPS."""
        if sudo and self.config.username != "root":
            command = f"sudo {command}"
        
        logger.debug(f"Running: {command}")
        
        stdin, stdout, stderr = self.client.exec_command(command, timeout=300)
        exit_code = stdout.channel.recv_exit_status()
        
        stdout_text = stdout.read().decode().strip()
        stderr_text = stderr.read().decode().strip()
        
        if exit_code != 0 and check:
            logger.debug(f"Command exited with code {exit_code}")
            if stderr_text:
                logger.debug(f"stderr: {stderr_text}")
        
        return exit_code, stdout_text, stderr_text

    def file_exists(self, path: str) -> bool:
        """Check if a file exists on the VPS."""
        exit_code, _, _ = self.run_command(f"test -f {path}", check=False)
        return exit_code == 0

    def dir_exists(self, path: str) -> bool:
        """Check if a directory exists on the VPS."""
        exit_code, _, _ = self.run_command(f"test -d {path}", check=False)
        return exit_code == 0

    def read_file(self, path: str) -> str | None:
        """Read file content from VPS."""
        exit_code, content, _ = self.run_command(f"cat {path} 2>/dev/null", check=False)
        if exit_code == 0:
            return content
        return None

    def prompt_update(self, file_name: str, reason: str) -> bool:
        """Ask user if they want to update a file."""
        print()
        logger.warning(f"  ⚠ {file_name} needs update: {reason}")
        response = input(f"    Update {file_name}? [y/N]: ").strip().lower()
        return response in ("y", "yes")

    def step_update_system(self) -> bool:
        """Update system packages."""
        logger.info("→ Checking system update status...")
        
        # Check when last updated (within last hour = skip)
        exit_code, output, _ = self.run_command(
            "stat -c %Y /var/cache/apt/pkgcache.bin 2>/dev/null || echo 0",
            check=False
        )
        
        try:
            last_update = int(output) if output.isdigit() else 0
            current_time = int(time.time())
            # Skip if updated within last hour
            if current_time - last_update < 3600:
                logger.info("  ✓ System was recently updated, skipping")
                return True
        except (ValueError, TypeError):
            pass
        
        logger.info("→ Updating system packages (this may take a few minutes)...")
        
        for cmd in ["apt update -y", "apt upgrade -y"]:
            exit_code, _, stderr = self.run_command(cmd, sudo=True)
            if exit_code != 0:
                logger.error(f"  ✗ Failed: {cmd}")
                print(MANUAL_INSTRUCTIONS["update_system"])
                return False
        
        logger.info("  ✓ System updated")
        return True

    def step_install_docker(self) -> bool:
        """Install Docker and Docker Compose."""
        logger.info("→ Checking Docker installation...")
        
        exit_code, version, _ = self.run_command("docker --version", check=False)
        if exit_code == 0:
            logger.info(f"  ✓ Docker already installed: {version}")
            
            # Also check docker compose
            exit_code, version, _ = self.run_command("docker compose version", check=False)
            if exit_code == 0:
                logger.info(f"  ✓ Docker Compose already installed: {version}")
                return True
        
        logger.info("→ Installing Docker (this may take a few minutes)...")
        
        commands = [
            "curl -fsSL https://get.docker.com | sh",
            f"usermod -aG docker {self.config.username}",
            "apt install -y docker-compose-plugin",
        ]
        
        for cmd in commands:
            exit_code, _, stderr = self.run_command(cmd, sudo=True)
            if exit_code != 0:
                logger.error("  ✗ Failed to install Docker")
                print(MANUAL_INSTRUCTIONS["install_docker"])
                return False
        
        # Verify
        exit_code, version, _ = self.run_command("docker --version")
        if exit_code == 0:
            logger.info(f"  ✓ Docker installed: {version}")
        else:
            logger.error("  ✗ Docker installation verification failed")
            print(MANUAL_INSTRUCTIONS["install_docker"])
            return False
        
        exit_code, version, _ = self.run_command("docker compose version")
        if exit_code == 0:
            logger.info(f"  ✓ Docker Compose installed: {version}")
        
        return True

    def step_create_directory(self) -> bool:
        """Create project directory."""
        logger.info("→ Checking project directory...")
        
        if self.dir_exists("~/overdraft"):
            logger.info("  ✓ Directory ~/overdraft already exists")
            return True
        
        logger.info("→ Creating project directory...")
        
        exit_code, _, _ = self.run_command("mkdir -p ~/overdraft")
        if exit_code != 0:
            logger.error("  ✗ Failed to create directory")
            print(MANUAL_INSTRUCTIONS["create_directory"])
            return False
        
        logger.info("  ✓ Created ~/overdraft")
        return True

    def step_create_docker_compose(self) -> bool:
        """Create docker-compose.yml file."""
        logger.info("→ Checking docker-compose.yml...")
        
        if self.file_exists("~/overdraft/docker-compose.yml"):
            current = self.read_file("~/overdraft/docker-compose.yml")
            # Check required configurations
            has_frontend = "/var/www/overdraft" in current if current else False
            has_config_data = "config_data:/app/data/configs" in current if current else False
            has_root_user = 'user: "0:0"' in current if current else False
            
            needs_frontend = self.config.domain and not has_frontend
            needs_config_data = not has_config_data
            needs_root_user = not has_root_user
            needs_update = needs_frontend or needs_config_data or needs_root_user
            
            if needs_update:
                reasons = []
                if needs_config_data:
                    reasons.append("config storage volume")
                if needs_root_user:
                    reasons.append("root user for permissions")
                if needs_frontend:
                    reasons.append("frontend volume mount")
                reason = "missing: " + ", ".join(reasons)
                if not self.prompt_update("docker-compose.yml", reason):
                    logger.info("  ⏭ Skipped update")
                    return True
            else:
                logger.info("  ✓ docker-compose.yml already exists and is up to date")
                return True
        
        logger.info("→ Creating docker-compose.yml...")
        
        github_username = self.config.github_username.lower()
        
        if self.config.domain:
            content = f'''services:
  api:
    image: ghcr.io/{github_username}/overdraft-api:latest
    user: "0:0"
    expose:
      - "8000"
    env_file:
      - .env
    volumes:
      - config_data:/app/data/configs
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - /var/www/overdraft:/var/www/overdraft:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
  config_data:
'''
        else:
            content = f'''services:
  api:
    image: ghcr.io/{github_username}/overdraft-api:latest
    user: "0:0"
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - config_data:/app/data/configs
    restart: unless-stopped

volumes:
  config_data:
'''
        
        cmd = f"cat > ~/overdraft/docker-compose.yml << 'EOF'\n{content}EOF"
        exit_code, _, stderr = self.run_command(cmd)
        
        if exit_code != 0:
            logger.error("  ✗ Failed to create docker-compose.yml")
            print(MANUAL_INSTRUCTIONS["create_docker_compose"])
            return False
        
        logger.info("  ✓ Created docker-compose.yml")
        return True

    def _build_env_content(self) -> str:
        """Build .env file content from current config."""
        import json
        
        if self.config.cors_origins:
            cors_value = json.dumps(self.config.cors_origins)
        else:
            cors_value = '["*"]'
        
        return f"""GOOGLE_API_KEY={self.config.google_api_key}
CACHE_TTL={self.config.cache_ttl}
CORS_ORIGINS={cors_value}
RATE_LIMIT={self.config.rate_limit}
CONFIG_STORAGE_PATH=/app/data/configs
"""

    def step_create_env_file(self) -> bool:
        """Create .env file."""
        logger.info("→ Checking .env file...")
        
        # Required variables that must be present
        required_vars = [
            "GOOGLE_API_KEY",
            "CACHE_TTL", 
            "CORS_ORIGINS",
            "RATE_LIMIT",
            "CONFIG_STORAGE_PATH",
        ]
        
        if self.file_exists("~/overdraft/.env"):
            current = self.read_file("~/overdraft/.env") or ""
            
            # Check for missing variables
            missing_vars = [var for var in required_vars if var not in current]
            
            if missing_vars:
                missing_str = ", ".join(missing_vars)
                if not self.prompt_update(".env", f"missing: {missing_str}"):
                    logger.info("  ⏭ Skipped update")
                    return True
                
                # User agreed - recreate the file with all variables
                content = self._build_env_content()
                cmd = f"cat > ~/overdraft/.env << 'EOF'\n{content}EOF"
                exit_code, _, _ = self.run_command(cmd)
                
                if exit_code == 0:
                    logger.info(f"  ✓ Updated .env (added: {missing_str})")
                else:
                    logger.error("  ✗ Failed to update .env")
                    print(MANUAL_INSTRUCTIONS["create_env"])
                    return False
                return True
            else:
                logger.info("  ✓ .env already exists and is up to date")
                return True
        
        logger.info("→ Creating .env file...")
        
        content = self._build_env_content()
        cmd = f"cat > ~/overdraft/.env << 'EOF'\n{content}EOF"
        exit_code, _, _ = self.run_command(cmd)
        
        if exit_code != 0:
            logger.error("  ✗ Failed to create .env")
            print(MANUAL_INSTRUCTIONS["create_env"])
            return False
        
        logger.info("  ✓ Created .env")
        return True

    def step_create_frontend_dir(self) -> bool:
        """Create frontend directory for static files."""
        logger.info("→ Checking frontend directory...")
        
        if self.dir_exists("/var/www/overdraft"):
            logger.info("  ✓ Directory /var/www/overdraft already exists")
            return True
        
        logger.info("→ Creating frontend directory...")
        
        exit_code, _, _ = self.run_command("mkdir -p /var/www/overdraft", sudo=True)
        if exit_code != 0:
            logger.error("  ✗ Failed to create directory")
            return False
        
        logger.info("  ✓ Created /var/www/overdraft")
        return True

    def step_create_caddyfile(self) -> bool:
        """Create Caddyfile if domain is specified."""
        if not self.config.domain:
            logger.info("→ Skipping Caddyfile (no domain specified)")
            return True
        
        logger.info("→ Checking Caddyfile...")
        
        if self.file_exists("~/overdraft/Caddyfile"):
            current = self.read_file("~/overdraft/Caddyfile")
            
            # Extract base domain
            base_domain = self.config.domain
            if base_domain and base_domain.startswith("api."):
                base_domain = base_domain[4:]
            
            # Check if both frontend and API domains are configured
            has_frontend = current and base_domain and f"{base_domain} {{" in current
            has_api = current and base_domain and f"api.{base_domain}" in current
            has_frontend_root = current and "/var/www/overdraft" in current
            
            if base_domain and (not has_frontend or not has_frontend_root):
                if not self.prompt_update("Caddyfile", f"missing frontend config for {base_domain}"):
                    logger.info("  ⏭ Skipped update")
                    return True
            elif not has_api and base_domain:
                if not self.prompt_update("Caddyfile", f"missing API config for api.{base_domain}"):
                    logger.info("  ⏭ Skipped update")
                    return True
            else:
                logger.info("  ✓ Caddyfile already exists and is up to date")
                return True
        
        # Extract base domain (remove api. prefix if present)
        base_domain = self.config.domain
        if base_domain.startswith("api."):
            base_domain = base_domain[4:]
        
        logger.info(f"→ Creating Caddyfile for {base_domain}...")
        
        # Frontend + API configuration
        content = f"""# Frontend - static files
{base_domain} {{
    root * /var/www/overdraft
    file_server
    encode gzip
    
    header {{
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-XSS-Protection "1; mode=block"
        -Server
    }}
    
    # SPA fallback
    try_files {{path}} /index.html
    
    log {{
        output stdout
        format console
    }}
}}

# API - reverse proxy to Docker container
api.{base_domain} {{
    reverse_proxy api:8000
    encode gzip
    
    header {{
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }}
    
    log {{
        output stdout
        format console
    }}
}}
"""
        
        cmd = f"cat > ~/overdraft/Caddyfile << 'EOF'\n{content}EOF"
        exit_code, _, _ = self.run_command(cmd)
        
        if exit_code != 0:
            logger.error("  ✗ Failed to create Caddyfile")
            print(MANUAL_INSTRUCTIONS["create_caddyfile"])
            return False
        
        logger.info(f"  ✓ Created Caddyfile for {base_domain} + api.{base_domain}")
        return True

    def step_configure_firewall(self) -> bool:
        """Configure UFW firewall."""
        logger.info("→ Checking firewall status...")
        
        exit_code, status, _ = self.run_command("ufw status", check=False, sudo=True)
        
        # Check if already configured
        if exit_code == 0 and "Status: active" in status:
            has_ssh = "22" in status or "OpenSSH" in status
            has_80 = "80" in status
            has_443 = "443" in status
            
            if has_ssh and has_80 and has_443:
                logger.info("  ✓ Firewall already configured")
                return True
        
        logger.info("→ Configuring firewall...")
        
        # Note: Port 8000 is NOT opened - traffic goes through Caddy (80/443)
        commands = [
            "ufw allow OpenSSH",
            "ufw allow 80",
            "ufw allow 443",
            "ufw --force enable",
        ]
        
        for cmd in commands:
            exit_code, _, _ = self.run_command(cmd, check=False, sudo=True)
            if exit_code != 0:
                logger.error(f"  ✗ Failed: {cmd}")
                print(MANUAL_INSTRUCTIONS["configure_firewall"])
                return False
        
        logger.info("  ✓ Firewall configured")
        return True

    def step_login_ghcr(self) -> bool:
        """Login to GitHub Container Registry."""
        logger.info("→ Checking GHCR login status...")
        
        # Check if already logged in
        exit_code, output, _ = self.run_command(
            "cat ~/.docker/config.json 2>/dev/null | grep -q ghcr.io",
            check=False
        )
        
        if exit_code == 0:
            logger.info("  ✓ Already logged in to GHCR")
            return True
        
        logger.info("→ Logging in to GHCR...")
        
        cmd = f'echo "{self.config.github_pat}" | docker login ghcr.io -u {self.config.github_username} --password-stdin'
        exit_code, stdout, stderr = self.run_command(cmd)
        
        if exit_code == 0 or "Login Succeeded" in stdout:
            logger.info("  ✓ Logged in to GHCR")
            return True
        
        logger.error("  ✗ Failed to login to GHCR")
        print(MANUAL_INSTRUCTIONS["login_ghcr"])
        return False

    def step_pull_and_start(self) -> bool:
        """Pull images and start containers."""
        logger.info("→ Checking if containers are running...")
        
        exit_code, output, _ = self.run_command(
            "cd ~/overdraft && docker compose ps --format json 2>/dev/null | head -1",
            check=False
        )
        
        if exit_code == 0 and output and "api" in output:
            logger.info("  ✓ Containers already running")
            
            # Health check
            exit_code, stdout, _ = self.run_command(
                "curl -sf http://localhost:8000/health",
                check=False
            )
            if exit_code == 0:
                logger.info(f"  ✓ Health check passed: {stdout}")
            return True
        
        logger.info("→ Pulling Docker images...")
        
        exit_code, _, stderr = self.run_command("cd ~/overdraft && docker compose pull", check=False)
        if exit_code != 0:
            logger.info("  ℹ Image not found yet (normal for first setup)")
            print(MANUAL_INSTRUCTIONS["pull_and_start"])
            # This is not a fatal error - image will exist after first push
            return True
        
        logger.info("  ✓ Images pulled")
        
        logger.info("→ Starting containers...")
        exit_code, _, stderr = self.run_command("cd ~/overdraft && docker compose up -d")
        if exit_code != 0:
            logger.error(f"  ✗ Failed to start containers: {stderr}")
            return False
        
        logger.info("  ✓ Containers started")
        
        time.sleep(3)
        exit_code, stdout, _ = self.run_command("curl -sf http://localhost:8000/health", check=False)
        if exit_code == 0:
            logger.info(f"  ✓ Health check passed: {stdout}")
        
        return True

    def step_restart_containers(self) -> bool:
        """Restart all containers to ensure clean state."""
        logger.info("→ Restarting containers...")
        
        exit_code, _, stderr = self.run_command(
            "cd ~/overdraft && docker compose up -d --force-recreate"
        )
        
        if exit_code != 0:
            logger.error(f"  ✗ Failed to restart containers: {stderr}")
            return False
        
        logger.info("  ✓ Containers restarted")
        
        time.sleep(3)
        exit_code, stdout, _ = self.run_command(
            "curl -sf http://localhost:8000/health",
            check=False
        )
        if exit_code == 0:
            logger.info(f"  ✓ Health check passed: {stdout}")
        
        return True

    def step_fix_config_permissions(self) -> bool:
        """Fix permissions on config storage directory inside container."""
        logger.info("→ Checking config directory permissions...")
        
        # Check if container is running
        exit_code, _, _ = self.run_command(
            "cd ~/overdraft && docker compose ps --format json 2>/dev/null | grep -q api",
            check=False
        )
        
        if exit_code != 0:
            logger.info("  ⏭ Container not running, skipping")
            return True
        
        # Create directory and fix permissions
        commands = [
            "cd ~/overdraft && docker compose exec -T api mkdir -p /app/data/configs",
            "cd ~/overdraft && docker compose exec -T api chmod 777 /app/data/configs",
        ]
        
        for cmd in commands:
            exit_code, _, stderr = self.run_command(cmd, check=False)
            if exit_code != 0:
                logger.warning(f"  ⚠ Command failed: {stderr}")
                # Not fatal - directory might already exist with correct permissions
        
        # Verify write access
        exit_code, _, _ = self.run_command(
            "cd ~/overdraft && docker compose exec -T api touch /app/data/configs/.write_test && "
            "docker compose exec -T api rm /app/data/configs/.write_test",
            check=False
        )
        
        if exit_code == 0:
            logger.info("  ✓ Config directory is writable")
        else:
            logger.error("  ✗ Config directory is not writable")
            print(MANUAL_INSTRUCTIONS["fix_config_permissions"])
            return False
        
        return True

    def run_setup(self) -> bool:
        """Run the complete setup process."""
        print()
        logger.info("=" * 60)
        logger.info("OverDraft VPS Setup")
        logger.info("=" * 60)
        
        if not self.connect():
            return False
        
        try:
            steps: list[tuple[str, Callable[[], bool]]] = [
                ("System Update", self.step_update_system),
                ("Docker Installation", self.step_install_docker),
                ("Create Directory", self.step_create_directory),
                ("Create docker-compose.yml", self.step_create_docker_compose),
                ("Create .env", self.step_create_env_file),
                ("Create Frontend Dir", self.step_create_frontend_dir),
                ("Create Caddyfile", self.step_create_caddyfile),
                ("Configure Firewall", self.step_configure_firewall),
                ("GHCR Login", self.step_login_ghcr),
                ("Pull and Start", self.step_pull_and_start),
                ("Restart Containers", self.step_restart_containers),
                ("Fix Config Permissions", self.step_fix_config_permissions),
            ]
            
            for i, (name, step_func) in enumerate(steps, 1):
                print()
                logger.info(f"Step {i}/{len(steps)}: {name}")
                logger.info("-" * 40)
                
                if not step_func():
                    logger.error(f"✗ Setup failed at step: {name}")
                    logger.info("")
                    logger.info("Fix the issue using the instructions above,")
                    logger.info("then re-run the script to continue.")
                    return False
            
            # Success - show next steps
            print()
            logger.info("=" * 60)
            logger.info("✓ VPS Setup Completed Successfully!")
            logger.info("=" * 60)
            
            if self.config.domain:
                print()
                dns_info = MANUAL_INSTRUCTIONS["dns_setup"]
                dns_info = dns_info.replace("YOUR_DOMAIN", self.config.domain)
                dns_info = dns_info.replace("YOUR_VPS_IP", self.config.host)
                print(dns_info)
            
            print()
            secrets_info = MANUAL_INSTRUCTIONS["github_secrets"]
            secrets_info = secrets_info.replace("YOUR_VPS_IP", self.config.host)
            print(secrets_info)
            
            print()
            logger.info("=" * 60)
            logger.info("Final Steps:")
            logger.info("=" * 60)
            logger.info("1. Configure GitHub Secrets (see above)")
            if self.config.domain:
                logger.info("2. Configure DNS A record (see above)")
                logger.info("3. Push to main branch to trigger first deploy")
                logger.info(f"4. Test: curl https://{self.config.domain}/health")
            else:
                logger.info("2. Push to main branch to trigger first deploy")
                logger.info(f"3. Test: curl http://{self.config.host}:8000/health")
            
            return True
            
        finally:
            self.disconnect()


def prompt(message: str, default: str = "", env_value: str | None = None) -> str:
    """
    Prompt user for input with optional default and env value.
    
    Priority: env_value > user input > default
    """
    if env_value:
        print(f"{message}: {env_value} (from .env.setup)")
        return env_value
    if default:
        result = input(f"{message} [{default}]: ").strip()
        return result if result else default
    return input(f"{message}: ").strip()


def prompt_secret(message: str) -> str:
    """Prompt for secret input (hidden)."""
    return getpass.getpass(f"{message}: ")


def load_env_config() -> dict[str, str]:
    """Load configuration from .env.setup file if it exists."""
    script_dir = Path(__file__).parent
    env_file = script_dir / ".env.setup"
    
    config = {}
    
    if env_file.exists():
        load_dotenv(env_file)
        print(f"✓ Loaded configuration from {env_file}")
        print()
        
        # Load all values including secrets
        config["VPS_HOST"] = os.getenv("VPS_HOST", "")
        config["VPS_USER"] = os.getenv("VPS_USER", "root")
        config["SSH_KEY_PATH"] = os.getenv("SSH_KEY_PATH", "")
        config["GITHUB_USERNAME"] = os.getenv("GITHUB_USERNAME", "")
        config["GITHUB_PAT"] = os.getenv("GITHUB_PAT", "")
        config["GOOGLE_API_KEY"] = os.getenv("GOOGLE_API_KEY", "")
        config["DOMAIN"] = os.getenv("DOMAIN", "")
        config["CORS_ORIGINS"] = os.getenv("CORS_ORIGINS", "")
        config["RATE_LIMIT"] = os.getenv("RATE_LIMIT", "60/minute")
        config["CACHE_TTL"] = os.getenv("CACHE_TTL", "1")
    else:
        print(f"ℹ No .env.setup found at {env_file}")
        print("  Create from env.setup.example to configure all parameters.")
        print()
    
    return config


def main():
    """Main entry point."""
    print()
    print("=" * 60)
    print("  OverDraft VPS Setup Script")
    print("=" * 60)
    print()
    print("This script will configure your VPS for running OverDraft API.")
    print("Each step checks if already completed and skips if so.")
    print()
    print("All parameters can be set in .env.setup (copy from env.setup.example).")
    print("Missing values will be prompted interactively.")
    print()
    
    # Load .env.setup if exists
    env_config = load_env_config()
    
    # Gather configuration
    print("-" * 60)
    print("VPS Connection")
    print("-" * 60)
    
    host = prompt("VPS IP address", env_value=env_config.get("VPS_HOST") or None)
    if not host:
        print("Error: VPS IP is required")
        sys.exit(1)
    
    username = prompt(
        "SSH username", 
        default="root", 
        env_value=env_config.get("VPS_USER") or None
    )
    
    default_key = Path("~/.ssh/id_ed25519").expanduser()
    if not default_key.exists():
        default_key = Path("~/.ssh/id_rsa").expanduser()
    
    ssh_key_path = prompt(
        "SSH key path", 
        default=str(default_key),
        env_value=env_config.get("SSH_KEY_PATH") or None
    )
    
    print()
    print("-" * 60)
    print("GitHub Configuration")
    print("-" * 60)
    
    github_username = prompt(
        "GitHub username",
        env_value=env_config.get("GITHUB_USERNAME") or None
    )
    if not github_username:
        print("Error: GitHub username is required")
        sys.exit(1)
    
    github_pat = env_config.get("GITHUB_PAT", "")
    if github_pat:
        print(f"GitHub PAT: {'*' * 10}... (from .env.setup)")
    else:
        print()
        print("GitHub PAT is needed to pull images from GHCR.")
        print("Create at: GitHub → Settings → Developer settings → Personal access tokens")
        print("Required scope: read:packages")
        github_pat = prompt_secret("GitHub PAT")
    
    if not github_pat:
        print("Error: GitHub PAT is required")
        sys.exit(1)
    
    print()
    print("-" * 60)
    print("Google API Configuration")
    print("-" * 60)
    
    google_api_key = env_config.get("GOOGLE_API_KEY", "")
    if google_api_key:
        print(f"Google API Key: {'*' * 10}... (from .env.setup)")
    else:
        print()
        print("Google API Key is needed to access Google Sheets.")
        print("Get at: https://console.cloud.google.com/apis/credentials")
        print("Enable: Google Sheets API")
        google_api_key = prompt_secret("Google API Key")
    
    if not google_api_key:
        print("Error: Google API Key is required")
        sys.exit(1)
    
    print()
    print("-" * 60)
    print("Domain Configuration")
    print("-" * 60)
    
    domain = prompt(
        "Domain for HTTPS (leave empty for HTTP by IP)", 
        default="",
        env_value=env_config.get("DOMAIN") or None
    )
    
    print()
    print("-" * 60)
    print("Security Configuration")
    print("-" * 60)
    
    cors_env = env_config.get("CORS_ORIGINS", "")
    if cors_env:
        print(f"CORS origins: {cors_env} (from .env.setup)")
        cors_input = cors_env
    else:
        print()
        print("CORS origins - allowed domains that can call your API.")
        print("For production, specify exact origins (comma-separated).")
        print("Example: https://yourdomain.com,https://app.yourdomain.com")
        print("Leave empty to allow all origins (NOT recommended for production).")
        cors_input = input("CORS origins (comma-separated): ").strip()
    
    cors_origins: list[str] | None = None
    if cors_input:
        cors_origins = [origin.strip() for origin in cors_input.split(",") if origin.strip()]
    
    rate_limit = prompt(
        "Rate limit",
        default="60/minute",
        env_value=env_config.get("RATE_LIMIT") or None
    )
    
    cache_ttl = int(env_config.get("CACHE_TTL", "1"))
    
    print()
    
    config = VPSConfig(
        host=host,
        username=username,
        ssh_key_path=ssh_key_path,
        github_username=github_username,
        github_pat=github_pat,
        google_api_key=google_api_key,
        domain=domain if domain else None,
        cors_origins=cors_origins,
        rate_limit=rate_limit,
        cache_ttl=cache_ttl,
    )
    
    setup = VPSSetup(config)
    success = setup.run_setup()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
