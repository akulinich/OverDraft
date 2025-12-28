# OverDraft

Overwatch 2 draft helper application for managing player pools and team compositions.

## Setup

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
git clone https://github.com/your-username/OverDraft.git
cd OverDraft/src
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Testing

### Run tests

```bash
cd src
npm test
```

### Run tests in watch mode

```bash
npm run test:watch
```

### Run tests with coverage

```bash
npm run test:coverage
```

### One-click test scripts (Windows)

From the project root:

- **Batch**: double-click `test.bat`
- **PowerShell**: run `.\test.ps1`

### Pre-commit hook

Tests run automatically before each commit. To skip (not recommended):

```bash
git commit --no-verify -m "message"
```

## Project Structure

```
OverDraft/
├── src/
│   ├── js/           # Application source
│   ├── styles/       # CSS
│   ├── tests/        # Test files
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   └── public/       # Static assets
├── .github/workflows/ # CI/CD
├── .husky/           # Git hooks
├── test.bat          # Windows test script
└── test.ps1          # PowerShell test script
```