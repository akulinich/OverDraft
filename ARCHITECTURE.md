# OverDraft — Architecture Document

## 1. Overview

**OverDraft** — a static website for real-time visualization of data from Google Sheets.

### Key Requirements

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | Configure one or multiple Google Sheets | Setup UI (blocking if none configured) |
| 2 | Real-time data updates | Polling with 1-second interval |
| 3 | Persist configuration across page reloads | localStorage |
| 4 | Host on GitHub Pages | Static SPA without backend |

### Constraints

- **Minimum 1 sheet required:** If no sheets are configured, the app shows a mandatory setup screen.
- **Sheets are changeable:** User can add, remove, or replace sheets at any time via settings.
- **Page structure TBD:** May be single-page or multi-page layout (to be determined later).
- **Sheets must be "Published to web":** Required for API-key-free access.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Pages                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Static SPA                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │  │
│  │  │   UI Layer  │  │ State Mgmt  │  │  Google Sheets   │   │  │
│  │  │  (Vanilla/  │◄─┤(localStorage│◄─┤   gviz Client    │   │  │
│  │  │   React)    │  │  + Memory)  │  │                  │   │  │
│  │  └─────────────┘  └─────────────┘  └────────┬─────────┘   │  │
│  └─────────────────────────────────────────────┼─────────────┘  │
└────────────────────────────────────────────────┼────────────────┘
                                                 │ HTTPS
                                                 ▼
                              ┌──────────────────────────────────┐
                              │   Google Visualization API       │
                              │   (docs.google.com/spreadsheets) │
                              │   No API key required            │
                              └──────────────────────────────────┘
```

---

## 3. Component Design

### 3.1 Module Structure

```
src/
├── index.html              # Entry point
├── styles/
│   └── main.css            # Application styles
├── js/
│   ├── main.js             # Application initialization
│   ├── config.js           # Configuration (intervals, limits)
│   ├── api/
│   │   └── sheets.js       # gviz API client
│   ├── storage/
│   │   └── persistence.js  # localStorage wrapper
│   ├── state/
│   │   └── store.js        # In-memory state management
│   ├── ui/
│   │   ├── components.js   # UI components
│   │   ├── renderer.js     # DOM rendering
│   │   └── events.js       # Event handlers
│   └── utils/
│       ├── parser.js       # Sheet URL parsing
│       └── polling.js      # Polling manager
└── assets/
    └── ...                 # Icons, fonts
```

### 3.2 Components

#### API Client (`api/sheets.js`)

```javascript
// Interface
interface SheetsClient {
  fetchSheet(spreadsheetId: string, gid: string): Promise<SheetData>;
  fetchMultiple(sheets: SheetConfig[]): Promise<SheetData[]>;
}

// SheetConfig — user provides URL containing both
interface SheetConfig {
  spreadsheetId: string;  // from URL
  gid: string;            // from URL (sheet tab ID)
  alias?: string;         // user-defined name
}

// SheetData structure
interface SheetData {
  spreadsheetId: string;
  gid: string;
  data: string[][];       // 2D array of cell values
  lastUpdated: Date;
}
```

**gviz Endpoint Characteristics:**
- No API key required
- Sheet must be "Published to web" (File → Share → Publish to web)
- No hard rate limits (soft limits per IP)
- Returns JSON or CSV format

#### State Store (`state/store.js`)

```javascript
interface AppState {
  sheets: Map<string, SheetData>;    // Cached sheet data (key: spreadsheetId_gid)
  configuredSheets: SheetConfig[];   // User-configured sheets
  isLoading: boolean;
  errors: Map<string, Error>;
  pollingInterval: number;           // ms (default: 1000)
}
```

#### Persistence Layer (`storage/persistence.js`)

```javascript
// localStorage keys
const STORAGE_KEYS = {
  CONFIGURED_SHEETS: 'overdraft_configured_sheets',
  SETTINGS: 'overdraft_settings'
};

interface StoredSettings {
  pollingInterval: number;
  theme: 'light' | 'dark';
}
```

---

## 4. Data Flow

### 4.1 Application Load

```
┌──────────┐     ┌────────────┐     ┌─────────────┐
│  Page    │────►│  Load      │────►│  Restore    │
│  Load    │     │  Config    │     │  from       │
│          │     │            │     │  localStorage│
└──────────┘     └────────────┘     └──────┬──────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      │                                         │
                      ▼                                         ▼
               [sheets exist?]                           [no sheets]
                      │                                         │
                      ▼                                         ▼
              ┌─────────────┐                          ┌─────────────┐
              │  Fetch      │                          │  Show       │
              │  Sheet Data │                          │  Setup UI   │
              └──────┬──────┘                          │  (required) │
                     │                                 └─────────────┘
                     ▼
              ┌─────────────┐     ┌─────────────┐
              │  Render     │────►│  Start      │
              │  Visualizer │     │  Polling    │
              └─────────────┘     └─────────────┘
```

**Constraint:** At least one sheet must be configured. If none exists, the setup UI is shown as a blocking modal.

### 4.2 Sheet Configuration

User can change configured sheets at any time via settings.

```
User Input (Google Sheet URL with gid)
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Validate   │────►│  Update     │────►│  Save to    │
│  & Parse    │     │  State      │     │  localStorage│
│  (extract   │     │             │     │             │
│  id + gid)  │     │             │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
       ┌───────────────────────────────────────┘
       ▼
┌─────────────┐     ┌─────────────┐
│  Fetch      │────►│  Update     │
│  Sheet Data │     │  Visualizer │
└─────────────┘     └─────────────┘
```

**URL Parsing Example:**
```
Input:  https://docs.google.com/spreadsheets/d/1GXFIaieJ2zG28dSu.../edit?gid=1506748454#gid=1506748454
Output: { spreadsheetId: "1GXFIaieJ2zG28dSu...", gid: "1506748454" }
```

**Notes:**
- User provides full URL for each sheet tab they want to display
- Each tab in a spreadsheet has a unique gid
- Sheets can be added, removed, or replaced
- Removal of the last sheet triggers the setup UI again

### 4.3 Polling Cycle

```
┌─────────────────────────────────────────────────────────┐
│                    Polling Loop (1 second)              │
│                                                         │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐           │
│  │ Wait    │───►│ Fetch    │───►│ Compare  │           │
│  │ 1000ms  │    │ All      │    │ with     │           │
│  │         │    │ Sheets   │    │ Cache    │           │
│  └─────────┘    └──────────┘    └────┬─────┘           │
│       ▲                              │                  │
│       │         ┌──────────┐         │                  │
│       └─────────│ Update   │◄────────┘                  │
│                 │ if       │  (changes detected)        │
│                 │ Changed  │                            │
│                 └──────────┘                            │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Google Sheets Integration (gviz)

### 5.1 Data Access

**gviz Endpoint (no API key required)**

```javascript
const GVIZ_BASE = 'https://docs.google.com/spreadsheets/d';

async function fetchSheet(spreadsheetId, gid) {
  const url = `${GVIZ_BASE}/${spreadsheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const response = await fetch(url);
  const text = await response.text();
  
  // gviz returns JSONP-like format: google.visualization.Query.setResponse({...})
  // Extract JSON from response
  const jsonString = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/)[1];
  return JSON.parse(jsonString);
}
```

**Requirements:**
- Sheet must be "Published to web" (File → Share → Publish to web)
- Publishing creates a public snapshot that updates automatically
- Different from "Anyone with the link can view" — that's not enough

### 5.2 Response Format

```javascript
// gviz response structure
{
  "version": "0.6",
  "status": "ok",
  "table": {
    "cols": [
      { "id": "A", "label": "Name", "type": "string" },
      { "id": "B", "label": "Score", "type": "number" }
    ],
    "rows": [
      { "c": [{ "v": "Player1" }, { "v": 100 }] },
      { "c": [{ "v": "Player2" }, { "v": 200 }] }
    ]
  }
}
```

### 5.3 Alternative: CSV Format

```javascript
// Simpler but no column type info
const url = `${GVIZ_BASE}/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
const response = await fetch(url);
const csv = await response.text();
// Parse CSV manually or with library
```

### 5.4 Rate Limiting Considerations

| Factor | Value | Notes |
|--------|-------|-------|
| Per-IP soft limit | ~600 req/min | Not documented, empirical |
| Per-document limit | Unknown | High-traffic sheets may be throttled |
| Polling interval | 1000ms | 60 req/min per user per sheet |

**With 100 users from different IPs:**
- Each user: 60 req/min → within per-IP limit ✅
- Total to document: 6000 req/min → likely OK for popular sheets

**Fallback:** If throttling occurs, add Cloudflare Worker as caching proxy (see Section 10.2).

---

## 6. State Persistence

### 6.1 localStorage Schema

```javascript
// Key: overdraft_configured_sheets
{
  "version": 1,
  "sheets": [
    {
      "spreadsheetId": "1GXFIaieJ2zG28dSu_JUGSccq3RTu2Z4AqRt1xgdteR8",
      "gid": "1506748454",
      "alias": "Registrants",
      "addedAt": "2025-01-15T10:30:00Z"
    },
    {
      "spreadsheetId": "1GXFIaieJ2zG28dSu_JUGSccq3RTu2Z4AqRt1xgdteR8",
      "gid": "0",
      "alias": "Player Pool",
      "addedAt": "2025-01-15T10:31:00Z"
    }
  ]
}

// Key: overdraft_settings
{
  "version": 1,
  "pollingInterval": 1000,
  "theme": "light"
}
```

### 6.2 Migration Strategy

```javascript
const CURRENT_VERSION = 1;

function migrateStorage(stored) {
  if (!stored || !stored.version) {
    return getDefaultState();
  }
  
  // Future migrations
  // if (stored.version < 2) { stored = migrateV1toV2(stored); }
  
  return stored;
}
```

---

## 7. UI Components

### 7.1 Component Tree

```
App
├── SetupModal (blocking if no sheets configured)
│   ├── URLInput
│   ├── ValidationFeedback
│   └── ConfirmButton
├── Header
│   └── SettingsButton
├── DataDisplay (main visualizer area)
│   ├── TabBar (if multiple sheets/pages)
│   │   └── Tab (×N)
│   └── TableView
│       ├── TableHeader
│       └── TableBody
├── StatusBar
│   ├── LastUpdateTime
│   ├── PollingIndicator
│   └── ErrorMessages
└── SettingsModal
    ├── SheetConfiguration
    │   ├── CurrentSheetsList
    │   ├── URLInput
    │   └── RemoveButton (disabled if only 1 sheet)
    ├── PollingIntervalSlider
    └── ThemeToggle
```

**Page structure:** TBD — may be single page with tabs, or multiple separate pages. Architecture supports both.

### 7.2 Responsive Design

| Breakpoint | Layout |
|------------|--------|
| < 768px | Single column, tabs as dropdown |
| 768px - 1024px | Two columns |
| > 1024px | Multi-panel with sidebar |

---

## 8. Error Handling

### 8.1 Error Types

```javascript
class SheetError extends Error {
  constructor(type, message, sheetId, gid) {
    super(message);
    this.type = type;      // 'NOT_PUBLISHED' | 'NOT_FOUND' | 'NETWORK' | 'PARSE_ERROR'
    this.sheetId = sheetId;
    this.gid = gid;
  }
}
```

### 8.2 Error Recovery

| Error Type | Recovery Strategy |
|------------|-------------------|
| `NETWORK` | Exponential backoff retry (3 attempts) |
| `NOT_PUBLISHED` | Show instructions to publish sheet |
| `NOT_FOUND` | Show error, offer removal from list |
| `PARSE_ERROR` | Log error, skip update, continue polling |

---

## 9. Security Considerations

### 9.1 Data Handling

- All sheet data treated as untrusted input
- XSS prevention when rendering cells (escape HTML)
- No user credentials stored or transmitted
- No API keys required — zero secret management

### 9.2 CORS

gviz endpoint supports CORS for published sheets — direct browser requests work.

### 9.3 Privacy

- User's configured sheet URLs stored only in their browser (localStorage)
- No server-side tracking or analytics by default
- Sheet data fetched directly from Google, not proxied

---

## 10. Performance

### 10.1 Optimizations

| Area | Strategy |
|------|----------|
| Polling | Skip update if data unchanged (hash comparison) |
| Rendering | Virtual scrolling for large tables |
| Caching | In-memory cache with diff detection |
| Bundle | Code splitting, lazy loading |

### 10.2 Scaling Fallback: Cloudflare Worker

If gviz throttling occurs with many users, add a Cloudflare Worker as caching proxy:

```
Users ──► Cloudflare Worker ──► gviz
          (cache 1 second)
```

- Free tier: 100,000 requests/day
- Reduces load on gviz: all users get cached response
- Adds ~10ms latency but improves reliability

### 10.3 Metrics

- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Polling overhead: < 5% CPU at 1s interval

---

## 11. Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Build | Vite | Fast build, ESM native |
| UI | Vanilla JS / Preact | Minimal bundle size |
| Styling | CSS Variables + Vanilla CSS | No runtime overhead |
| Testing | Vitest + Testing Library | Fast, compatible |
| Linting | ESLint + Prettier | Code quality |

### 11.1 Dependencies (Minimal)

```json
{
  "devDependencies": {
    "vite": "^5.x",
    "vitest": "^1.x",
    "eslint": "^8.x"
  }
}
```

---

## 12. Deployment

### 12.1 GitHub Pages Setup

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### 12.2 Configuration

```javascript
// config.js
export const config = {
  defaultPollingInterval: 1000,  // 1 second for live updates
  maxSheets: 10,
  isDev: import.meta.env.DEV
};
```

No environment secrets required — all configuration is client-side.

---

## 13. Development Roadmap

### Phase 1: MVP
- [ ] Basic UI for adding sheets (URL input + validation)
- [ ] gviz API integration
- [ ] localStorage persistence
- [ ] 1-second polling

### Phase 2: Polish
- [ ] Enhanced table visualization
- [ ] Error handling & recovery
- [ ] Settings panel
- [ ] Responsive design

### Phase 3: Advanced
- [ ] Virtual scrolling
- [ ] Data filtering and search
- [ ] Export functionality
- [ ] PWA support
- [ ] Cloudflare Worker caching (if needed)

---

## 14. Testing Strategy

### 14.1 Unit Tests

- gviz response parsing
- State management logic
- URL parsing utilities (extract spreadsheetId + gid)
- localStorage wrapper

### 14.2 Integration Tests

- Full data flow (add sheet → fetch → display)
- Persistence across simulated "reload"
- Error scenarios (unpublished sheet, network failure)

### 14.3 E2E Tests (optional)

- Playwright for critical user flows

---

## 15. File Structure (Final)

```
OverDraft/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── src/
│   ├── index.html
│   ├── styles/
│   ├── js/
│   └── assets/
├── tests/
│   ├── unit/
│   └── integration/
├── .gitignore
├── package.json
├── vite.config.js
├── ARCHITECTURE.md
└── README.md
```

---

## Appendix A: How to Publish a Google Sheet

For the app to access sheet data without authentication:

1. Open the Google Sheet
2. **File → Share → Publish to web**
3. Select the sheet tab(s) to publish (or "Entire Document")
4. Click **Publish**
5. Confirm in the dialog

**Note:** "Publish to web" is different from sharing settings. Both can coexist:
- "Anyone with the link can view" → allows viewing in Google Sheets UI
- "Publish to web" → allows programmatic access via gviz endpoint

---

_Document version: 1.1_  
_Last updated: 2025-12-25_
