# Agent Context (CLAUDE)

This file is high-signal context for coding agents (Claude Code) working in this repository.

## Project Summary

`zm-dashboard` is a React-based web dashboard for ZoneMinder surveillance systems, designed to eventually replace the native ZoneMinder UI.

- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4 with custom "Mission Control" dark theme
- **Routing**: TanStack Router (file-based routing)
- **Data Fetching**: TanStack Query
- **State Management**: Zustand (auth store)
- **Backend**: Consumes `zm_api` REST API (running on `http://localhost:8080`)

## Design Aesthetic

"Mission Control" - dark, cyberpunk command center theme:
- Primary background: `#0a0a0f` (void)
- Accent color: `#00d4ff` (cyan)
- Alert colors: amber, crimson, emerald
- Monospace fonts for data, clean sans-serif for UI
- Subtle glow effects, grid backgrounds, smooth animations

## Project Structure

```
src/
├── api/           # API client and endpoint functions
├── components/
│   ├── common/    # Reusable UI components (Panel, etc.)
│   ├── console/   # Dashboard-specific components
│   └── layout/    # Sidebar, Header, MainLayout
├── routes/        # TanStack Router file-based routes
├── stores/        # Zustand stores (auth)
├── types/         # TypeScript interfaces
└── index.css      # Tailwind v4 theme and utilities
```

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (proxies /api to zm_api backend)
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## Browser Testing

**ALWAYS use `playwright-cli`** for browser automation testing. Run `playwright-cli --help` for all available commands.

**Test credentials**: See `.env` file (gitignored)

Example test flow:
```bash
playwright-cli open http://localhost:5174/
playwright-cli snapshot          # accessibility tree for element inspection
playwright-cli click e3          # click elements by ref from snapshot
playwright-cli fill e5 "text"    # fill form inputs
playwright-cli screenshot        # visual verification
playwright-cli close
```

Key commands:
- `playwright-cli open <url>` - Open browser and navigate
- `playwright-cli snapshot` - Inspect page structure (returns element refs like `e3`, `e5`)
- `playwright-cli click <ref>` / `fill <ref> "value"` - Interact using refs from snapshot
- `playwright-cli screenshot` - Take screenshot for visual verification
- `playwright-cli console` - Read browser console logs
- `playwright-cli network` - Inspect network requests
- `playwright-cli close` - Close the browser

## API Proxy

The Vite dev server proxies `/api` requests to the zm_api backend:
- Dev target: `http://localhost:8080`
- Configure in `vite.config.ts` if backend address changes

## API Specification

**OpenAPI Spec**: http://localhost:8080/api-docs/openapi.json
**Swagger UI**: http://localhost:8080/swagger-ui/

### Key API Response Patterns

**Paginated responses** use this structure:
```typescript
{
  items: T[];        // Array of items
  total: number;     // Total count
  per_page: number;  // Items per page
  current_page: number;  // Current page (1-indexed)
  last_page: number;     // Last page number
}
```

**Boolean fields** are returned as integers (0/1), not booleans:
- `enabled: 0 | 1`
- `archived: 0 | 1`
- `decoding_enabled: 0 | 1`

**Date fields** use snake_case with underscores:
- `start_date_time` (not `start_datetime`)
- `end_date_time` (not `end_datetime`)

**Type helpers** (in `src/types/index.ts`):
- `toBool(value)` - Convert API 0/1 to boolean
- `getMonitorFunction(fn)` - Safely cast string to MonitorFunction type

**Usage patterns**:
```typescript
// Checking boolean fields
if (monitor.enabled === 1) { ... }
if (event.archived === 1) { ... }

// Using function type safely
const monitorFn = getMonitorFunction(monitor.function);
const color = functionColors[monitorFn];
```

## Implementation Plan

### Phase 1: Core Infrastructure (Current)
- [x] Project scaffolding (Vite, React, Tailwind v4)
- [x] TanStack Router setup with file-based routing
- [x] TanStack Query setup
- [x] Auth store with JWT handling
- [x] API client layer
- [x] Base layout (Sidebar, Header)
- [x] Login page
- [x] Console/dashboard page (monitors grid, stats, events feed, system status)
- [x] Fix TypeScript build errors (path aliases)

### Phase 2: Monitor Views (Complete)
- [x] Monitors list page (`/monitors`)
- [x] Monitor detail page (`/monitors/$monitorId`)
- [x] Live streaming integration (HLS.js)
- [x] Monitor status indicators
- [x] Monitor controls (enable/disable toggle, function selector)

### Phase 3: Events
- [x] Events list page (`/events`) with filtering/pagination
- [x] Event detail page (`/events/$eventId`)
- [x] Event video playback
- [x] Event thumbnails

### Phase 4: Montage View
- [ ] Multi-monitor live view grid
- [ ] Customizable layouts (2x2, 3x3, etc.)
- [ ] Fullscreen mode

### Phase 5: PTZ Controls
- [ ] PTZ control overlay/panel
- [ ] Directional controls (pan/tilt)
- [ ] Zoom controls
- [ ] Preset positions

### Phase 6: Settings & Admin
- [ ] System settings page
- [ ] Monitor configuration
- [ ] User management (if applicable)

## Conventions

- Use `@/` path alias for imports from `src/`
- Components use PascalCase filenames
- Routes use kebab-case or param syntax (`$paramName`)
- API functions are async and return typed responses
- Use TanStack Query for all data fetching (not raw fetch in components)
- Tailwind classes only - no CSS modules or styled-components

## Known Issues

- Route tree needs regeneration when adding new routes (run dev server)
- Bundle size warning (>500KB) - consider code splitting for production
- Backend notes:
  - `/api/v3/daemons` returns empty array (no ZM daemons configured on test system)
  - Storage stats not available from `/api/v3/system/status`

## Related Projects

- `zm_api` - Rust REST API backend for ZoneMinder
