"""
API endpoint tests.
"""

import base64
import json
import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from pathlib import Path

from app.main import app

client = TestClient(app)


# Config API tests
class TestConfigAPI:
    """Tests for config sharing API endpoints."""
    
    @pytest.fixture(autouse=True)
    def setup_teardown(self):
        """Setup and teardown for each test."""
        # Use a temporary directory for config storage
        self.temp_dir = tempfile.mkdtemp()
        with patch.dict(os.environ, {"CONFIG_STORAGE_PATH": self.temp_dir}):
            yield
        # Cleanup
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_share_config_success(self):
        """Sharing a config returns a GUID."""
        config_data = {"test": "data"}
        config_base64 = base64.b64encode(json.dumps(config_data).encode()).decode()
        
        with patch.dict(os.environ, {"CONFIG_STORAGE_PATH": self.temp_dir}):
            response = client.post(
                "/api/config/share",
                json={"config": config_base64}
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "guid" in data
        assert "expiresAt" in data
        # GUID should be a valid UUID
        assert len(data["guid"]) == 36
    
    def test_share_config_empty(self):
        """Sharing empty config returns 422."""
        response = client.post(
            "/api/config/share",
            json={"config": ""}
        )
        assert response.status_code == 422
    
    def test_get_config_success(self):
        """Getting a shared config returns the config."""
        config_data = {"test": "data"}
        config_base64 = base64.b64encode(json.dumps(config_data).encode()).decode()
        
        with patch.dict(os.environ, {"CONFIG_STORAGE_PATH": self.temp_dir}):
            # First share a config
            share_response = client.post(
                "/api/config/share",
                json={"config": config_base64}
            )
            guid = share_response.json()["guid"]
            
            # Then retrieve it
            get_response = client.get(f"/api/config/{guid}")
        
        assert get_response.status_code == 200
        data = get_response.json()
        assert data["config"] == config_base64
    
    def test_get_config_not_found(self):
        """Getting non-existent config returns 404."""
        response = client.get("/api/config/12345678-1234-1234-1234-123456789012")
        assert response.status_code == 404
    
    def test_get_config_invalid_guid(self):
        """Getting config with invalid GUID returns 400."""
        response = client.get("/api/config/invalid-guid")
        assert response.status_code == 400


def test_health():
    """Health endpoint returns ok status."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_stats():
    """Stats endpoint returns metrics."""
    response = client.get("/stats")
    assert response.status_code == 200
    assert "server_rpm" in response.json()


def test_sheets_invalid_spreadsheet_id():
    """Invalid spreadsheet ID returns 400."""
    response = client.get("/api/sheets?spreadsheetId=!!invalid!!&gid=0")
    assert response.status_code == 400


def test_sheets_invalid_gid():
    """Invalid gid returns 400."""
    response = client.get("/api/sheets?spreadsheetId=abc123def456&gid=abc")
    assert response.status_code == 400


@patch("app.api.sheets.get_sheets_client")
def test_sheets_success(mock_client):
    """Valid request with mocked Google client returns CSV."""
    mock_instance = AsyncMock()
    mock_instance.fetch_sheet.return_value = {
        "headers": ["Name"], "data": [["Alice"]]
    }
    mock_client.return_value = mock_instance
    
    response = client.get("/api/sheets?spreadsheetId=1234567890abcdef&gid=0")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]

