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
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins (JSON array) |
| `RATE_LIMIT` | `90/minute` | Rate limit per IP per spreadsheet |

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

**Response:**
```json
{"status": "ok", "version": "1.0.0"}
```

### GET /stats

API usage statistics for monitoring.

**Response:**
```json
{
  "uptime_seconds": 3600,
  "started_at": "2025-01-01T00:00:00+00:00",
  "google_api_requests": 150,
  "cache_hits": 1200,
  "cache_misses": 150,
  "total_requests": 1350,
  "cache_hit_rate_percent": 88.9,
  "errors": 0,
  "requests_per_sheet": {
    "1GXFIaieJ2z...": 100,
    "2HYGJbjfK3a...": 50
  },
  "cache_size": 5
}
```

## Domain & DNS Setup

When deploying to a new domain, configure these DNS records in your domain provider's panel:

### Required DNS Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `api` | `<YOUR_SERVER_IP>` | 300 |

Example: For domain `example.com`, create A record for `api.example.com` → `123.45.67.89`

### Caddyfile Configuration

Update `Caddyfile` with your domain:

```caddyfile
api.yourdomain.com {
    reverse_proxy api:8000
    encode gzip
    
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }
}
```

### Frontend Configuration

Set the API URL in frontend environment:

```bash
# .env or environment variable
VITE_API_URL=https://api.yourdomain.com
```

### CORS Configuration

Update `.env` on the server:

```bash
# Allow requests from your frontend domain(s)
CORS_ORIGINS=["https://yourdomain.com", "https://app.yourdomain.com"]
```

### Verification Checklist

After DNS propagation (usually 5-30 minutes):

1. **Check DNS resolution:**
   ```bash
   nslookup api.yourdomain.com
   # Should return your server IP
   ```

2. **Check HTTPS certificate:**
   ```bash
   curl -I https://api.yourdomain.com/health
   # Should return 200 OK
   ```

3. **Check API stats:**
   ```bash
   curl https://api.yourdomain.com/stats
   # Should return JSON with metrics
   ```

4. **Test from frontend:**
   - Open browser DevTools → Network
   - Verify requests go to new API domain
   - Check for CORS errors

## Getting a Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the Google Sheets API
4. Go to Credentials → Create Credentials → API Key
5. Restrict the key to Google Sheets API only

## License

MIT



