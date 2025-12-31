# OverDraft API Server

Caching proxy for Google Sheets API with ETag/304 support.

## Quick Start (Development)

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp env.example .env
# Edit .env and set GOOGLE_API_KEY

# Run server
uvicorn app.main:app --reload
```

## Docker Deployment

```bash
# Copy and configure environment
cp env.example .env
# Edit .env: set GOOGLE_API_KEY

# Update Caddyfile with your domain

# Start services
docker-compose up -d
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_API_KEY` | (required) | Google Sheets API key |
| `CACHE_TTL` | `1` | Cache TTL in seconds |
| `HOST` | `0.0.0.0` | Server host |
| `PORT` | `8000` | Server port |
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins |

## API Endpoints

### GET /api/sheets

Fetch sheet data with caching.

**Query Parameters:**
- `spreadsheetId` - Google Sheets document ID
- `gid` - Sheet tab ID

**Headers:**
- `If-None-Match` - Optional ETag for cache validation

**Responses:**
- `200` - Sheet data with ETag header
- `304` - Not Modified (use cached data)
- `403` - Sheet is not public
- `404` - Sheet not found

### GET /health

Health check endpoint.

## Getting a Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the Google Sheets API
4. Go to Credentials → Create Credentials → API Key
5. Restrict the key to Google Sheets API only

## License

MIT



