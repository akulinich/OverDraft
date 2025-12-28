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
| 5 | Multi-language support | i18n module with RU/EN translations |

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
├── public/
│   ├── icons/              # Hero, role, rank icons
│   └── locales/            # Translation files
│       ├── en.json         # English translations
│       └── ru.json         # Russian translations
├── js/
│   ├── main.js             # Application initialization
│   ├── config.js           # Configuration (intervals, limits)
│   ├── version.js          # Version info
│   ├── api/
│   │   ├── sheets.js       # gviz API client
│   │   ├── local.js        # Local CSV file handling
│   │   └── overfast.js     # Hero/role data loader
│   ├── storage/
│   │   └── persistence.js  # localStorage wrapper
│   ├── state/
│   │   └── store.js        # In-memory state management
│   ├── i18n/
│   │   └── index.js        # Internationalization module
│   ├── ui/
│   │   ├── components.js   # UI components
│   │   ├── renderer.js     # DOM rendering
│   │   └── events.js       # Event handlers
│   ├── validation/
│   │   └── schema.js       # Teams data schema validation
│   └── utils/
│       ├── parser.js       # Sheet URL parsing
│       ├── polling.js      # Polling manager
│       ├── csv.js          # CSV parsing utilities
│       ├── ranks.js        # Rank badge utilities
│       └── export.js       # Configuration export
└── tests/
    ├── unit/               # Unit tests
    └── integration/        # Integration tests
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
  configuredSheets: SheetConfig[];   // User-configured sheets (players)
  teamsSheet: SheetConfig | null;    // Optional teams sheet configuration
  teamsData: SheetData | null;       // Cached teams sheet data
  isLoading: boolean;
  errors: Map<string, Error>;
  pollingInterval: number;           // ms (default: 1000)
  activeTab: 'players' | 'teams';    // Currently active tab
}
```

#### Persistence Layer (`storage/persistence.js`)

```javascript
// localStorage keys
const STORAGE_KEYS = {
  CONFIGURED_SHEETS: 'overdraft_configured_sheets',
  TEAMS_SHEET: 'overdraft_teams_sheet',
  SETTINGS: 'overdraft_settings',
  COLUMN_MAPPINGS: 'overdraft_column_mappings',
  TEAMS_LAYOUT: 'overdraft_teams_layout',
  LOCAL_CSV_DATA: 'overdraft_local_csv_data',
  LANGUAGE: 'overdraft_language'
};

interface StoredSettings {
  pollingInterval: number;
  theme: 'light' | 'dark';
}
```

#### Internationalization Module (`i18n/index.js`)

```javascript
// i18n module interface
interface I18nModule {
  init(): Promise<void>;                    // Initialize with stored/detected language
  t(key: string, params?: object): string;  // Get translated string
  getLanguage(): 'ru' | 'en';               // Get current language
  setLanguage(lang: 'ru' | 'en'): Promise<void>;  // Change language
  toggleLanguage(): Promise<void>;          // Switch between RU/EN
  translatePage(): void;                    // Translate all data-i18n elements
  subscribe(callback: Function): Function;  // Subscribe to language changes
}
```

**Translation file structure (`public/locales/*.json`):**
```javascript
{
  "app": { "title": "OverDraft — Player Pool" },
  "header": { "players": "Players", "teams": "Teams" },
  "settings": { "title": "Settings", ... },
  "errors": { "notFound": "Not found", ... },
  "columns": { "nickname": "Nickname", "role": "Role", ... },
  "status": { "updated": "Updated {time}", ... }
}
```

---

## 4. Data Flow

### 4.1 Application Load

```
┌──────────┐     ┌────────────┐     ┌─────────────┐     ┌─────────────┐
│  Page    │────►│  Init      │────►│  Restore    │────►│  Load       │
│  Load    │     │  i18n      │     │  from       │     │  Icons      │
│          │     │            │     │  localStorage│     │  Data       │
└──────────┘     └────────────┘     └──────┬──────┘     └──────┬──────┘
                                           │                    │
                      ┌────────────────────┴────────────────────┘
                      │
                      ▼
               [sheets exist?]
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
  ┌─────────────┐          ┌─────────────┐
  │  Fetch      │          │  Show       │
  │  Sheet Data │          │  Setup UI   │
  └──────┬──────┘          │  (required) │
         │                 └─────────────┘
         ▼
  ┌─────────────┐     ┌─────────────┐
  │  Render     │────►│  Start      │
  │  Visualizer │     │  Polling    │
  └─────────────┘     └─────────────┘
```

**i18n Initialization:**
1. Load stored language preference from localStorage
2. If not stored, detect from `navigator.language`
3. Default to Russian if language not supported
4. Load translation JSON file
5. Translate all elements with `data-i18n` attributes

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
  "theme": "dark"
}

// Key: overdraft_language
"ru"  // or "en" — stored as plain string
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
│   ├── SourceTypeToggle (Google Sheets / Local CSV)
│   ├── PlayersSheetSection
│   │   ├── URLInput (for Google Sheets)
│   │   ├── FileInput (for Local CSV)
│   │   └── ValidationFeedback
│   ├── TeamsSheetSection (optional)
│   │   ├── URLInput / FileInput
│   │   └── ValidationFeedback
│   └── ConfirmButton
├── Header
│   ├── Logo
│   ├── ExportButton
│   ├── LanguageButton (RU/EN toggle)
│   └── SettingsButton
├── TabsNav (Players / Teams)
├── FilterButtons (available, tank, dps, support)
├── DataDisplay (Players tab)
│   ├── PlayersTable
│   │   ├── TableHeader (sortable columns)
│   │   └── TableBody (with role/hero icons, rank badges)
│   └── PlayerDetailsPanel
│       ├── RatingSection
│       ├── RoleSection
│       ├── HeroesSection
│       └── AllDataSection
├── TeamsDisplay (Teams tab)
│   ├── ValidationErrorBox (if schema validation fails)
│   │   ├── ErrorMessage
│   │   └── SchemaDocumentation
│   ├── TeamsGrid
│   │   └── TeamCard (×N)
│   │       ├── TeamHeader (name, avg rating)
│   │       └── PlayerList
│   │           └── PlayerRow (role, nickname, rating, rank badge)
│   └── TeamsPlayerDetailsPanel
├── StatusBar
│   ├── PollingIndicator
│   ├── LastUpdateTime
│   ├── ErrorIndicator
│   └── VersionInfo
├── SettingsModal
│   ├── PlayersSheetInfo
│   ├── TeamsSheetInfo
│   ├── TeamsLayoutButton
│   ├── ChangeButton
│   ├── RefreshButton
│   ├── PollingIntervalSlider
│   └── ThemeToggle
├── ColumnMappingModal
│   ├── MappingTable
│   └── ConfirmButton
└── TeamsLayoutModal
    ├── LayoutParameters (8 inputs)
    ├── TablePreview
    └── ConfirmButton
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

### Phase 1: MVP ✅
- [x] Basic UI for adding sheets (URL input + validation)
- [x] gviz API integration
- [x] localStorage persistence
- [x] 1-second polling

### Phase 2: Polish ✅
- [x] Enhanced table visualization (role icons, rank badges, hero icons)
- [x] Error handling & recovery
- [x] Settings panel
- [x] Responsive design
- [x] Teams data visualization
- [x] Column mapping configuration
- [x] Teams layout configuration

### Phase 3: Advanced (In Progress)
- [x] Data filtering (by role, availability)
- [x] Export functionality (URL-based config sharing)
- [x] Local CSV file support
- [x] **Internationalization (RU/EN)**
- [ ] Virtual scrolling (for large datasets)
- [ ] PWA support
- [ ] Cloudflare Worker caching (if needed)

---

## 14. Testing Strategy

### 14.1 Unit Tests

- gviz response parsing
- State management logic
- URL parsing utilities (extract spreadsheetId + gid)
- localStorage wrapper
- CSV parsing
- Rank badge calculations
- Configuration export/import
- **i18n module** (`t()` function, language switching, interpolation)
- **Translation file integrity** (key consistency, no empty values, parameter matching)

### 14.2 Integration Tests

- Full data flow (add sheet → fetch → display)
- Persistence across simulated "reload"
- Error scenarios (unpublished sheet, network failure)
- Local CSV file handling
- Column mapping persistence
- Teams layout configuration
- **Language persistence** (save/load language preference)

### 14.3 E2E Tests (optional)

- Playwright for critical user flows

### 14.4 Test Coverage

Current test suite: **255 tests** across 12 test files
- `tests/unit/` — 7 test files (i18n, translations, csv, parser, schema, ranks, export)
- `tests/integration/` — 5 test files (store, persistence, local-api, realistic-data, advanced-layouts)

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

## Appendix A: Teams Data Schema

The application supports a secondary "Teams" sheet with the following expected format:

### Team Block Structure

Each team occupies 4 columns and 7 rows:

**Columns (per team):**
| Column | Content |
|--------|---------|
| 1 | Role (Танки, ДД, empty, Сапы, empty) |
| 2 | Player nickname |
| 3 | Player rating |
| 4 | Team average rating (first player row only) |

**Rows (per team block):**
| Row | Column 1 | Column 2 | Column 3 | Column 4 |
|-----|----------|----------|----------|----------|
| 1 | empty | Team name | empty | empty |
| 2 | Team # | empty | empty | empty |
| 3 | Танки | player1 | rating | avg |
| 4 | ДД | player2 | rating | empty |
| 5 | empty | player3 | rating | empty |
| 6 | Сапы | player4 | rating | empty |
| 7 | empty | player5 | rating | empty |

### Layout

- **3 teams per row** (horizontal arrangement)
- **1 empty column** between teams
- **2 empty rows** between team rows (vertical separation)

### Valid Role Values

| Role Type | Accepted Values (case-insensitive) |
|-----------|-----------------------------------|
| Tank | Танки, Tank, Танк |
| DPS | ДД, DPS, Damage, DD |
| Support | Сапы, Support, Саппорт, Healer |

### Rating Values

- Format: 4-digit integer
- Valid range: 0–9999 (typically 1000–5000 for Overwatch 2)
- Used for color-coded badges based on rank tier

### Validation

On load, the application validates the teams data against this schema. If validation fails:
1. An error message is displayed with specific issues
2. Expected schema documentation is shown
3. The teams tab displays the error instead of data

### Example Valid Data (CSV format)

```csv
,Alpha Team,,,,Beta Squad,,,,Gamma Force,,
1,,,,,2,,,,,3,,
Танки,TankMaster,3100,3600,,Танки,ShieldWall,3100,3380,,Танки,IronGuard,3900,3380
ДД,BlazeFury,3700,,,ДД,SniperX,3700,,,ДД,StormBlade,3800,
,NightHawk,3300,,,,PhantomAce,2400,,,,CyberWolf,2100,
Сапы,HealBot,4400,,,Сапы,MedicOne,4000,,,Сапы,LifeLink,3600,
,ZenMaster,3500,,,,AuraGuard,3700,,,,HolyLight,3500,
```

### Column Structure (per team, 4 columns + 1 separator)

| Column | Content |
|--------|---------|
| 1 | Role (Танки, ДД, empty, Сапы, empty) |
| 2 | Player nickname |
| 3 | Player rating |
| 4 | Team average rating (only in first player row) |
| 5 | Empty separator column |

### Row Structure (per team block)

| Row | Content |
|-----|---------|
| 1 | Team name in column 2 |
| 2 | Team number in column 1 |
| 3-7 | 5 players: Tank, DPS, DPS, Support, Support |

### Layout

- 3 teams per row (horizontal)
- Teams separated by 1 empty column
- Team blocks separated by 2 empty rows (vertical)

---

## Appendix B: How to Publish a Google Sheet

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

## Appendix C: Internationalization (i18n)

The application supports multiple languages with a custom i18n implementation.

### Supported Languages

| Code | Language | Default |
|------|----------|---------|
| `ru` | Russian  | Yes (fallback) |
| `en` | English  | No |

### Language Detection Priority

1. Stored preference in localStorage (`overdraft_language`)
2. Browser language (`navigator.language`)
3. Default: Russian

### Translation Approach

**Static HTML text:** Uses `data-i18n` attributes

```html
<h2 data-i18n="settings.title">Settings</h2>
<button data-i18n-title="export.tooltip" title="Export">...</button>
<input data-i18n-placeholder="setup.urlPlaceholder" placeholder="...">
```

**Dynamic JS text:** Uses `t()` function

```javascript
import { t } from './i18n/index.js';
element.textContent = t('settings.title');
t('status.updated', { time: '5s ago' });  // With interpolation
```

### Translation File Structure

Files located in `public/locales/{lang}.json`:

```javascript
{
  "app": { ... },           // App-wide strings
  "header": { ... },        // Header/tabs
  "setup": { ... },         // Setup modal
  "settings": { ... },      // Settings modal
  "columnMapping": { ... }, // Column mapping modal
  "teamsLayout": { ... },   // Teams layout modal
  "filters": { ... },       // Filter buttons
  "players": { ... },       // Player details panel
  "teams": { ... },         // Teams tab
  "roles": { ... },         // Role names
  "columns": { ... },       // Table column headers
  "status": { ... },        // Status bar messages
  "errors": { ... },        // Error messages
  "validation": { ... },    // Form validation messages
  "export": { ... },        // Export functionality
  "language": { ... }       // Language codes
}
```

### Language Toggle

- Located in header between Export and Settings buttons
- Displays current language code (RU/EN)
- Click toggles between languages
- All UI updates immediately without page reload

### Adding New Languages

1. Create `public/locales/{code}.json` with all keys
2. Update `detectBrowserLanguage()` in `i18n/index.js`
3. Update `setLanguage()` validation
4. Add language code to UI toggle

---

_Document version: 1.3_  
_Last updated: 2025-12-27_
