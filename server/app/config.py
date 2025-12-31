"""
Application configuration using pydantic-settings.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Google Sheets API
    google_api_key: str = ""
    
    # Cache settings
    cache_ttl: int = 1  # seconds
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # CORS - specify allowed origins, empty list = allow all (dev only)
    # Example: ["https://yourdomain.com", "https://app.yourdomain.com"]
    cors_origins: list[str] = []
    
    # Rate limiting
    rate_limit: str = "60/minute"  # requests per minute per IP
    
    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }
    
    @property
    def cors_allow_all(self) -> bool:
        """Check if CORS allows all origins (for dev)."""
        return len(self.cors_origins) == 0 or self.cors_origins == ["*"]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


