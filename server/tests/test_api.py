"""
API endpoint tests.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from app.main import app

client = TestClient(app)


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

