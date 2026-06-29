# Agent Context (CLAUDE)

This file is high-signal context for coding agents (Claude Code) working in this repository.

## Project Summary

`zm-dashboard` is a React-based web dashboard for ZoneMinder surveillance systems, designed to eventually replace the native ZoneMinder UI.

- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4 with custom "Mission Control" dark theme
- **Routing**: TanStack Router (file-based routing)
- **Data Fetching**: TanStack Query
- **State Management**: Zustand (auth store)
- **Backend**: Consumes `zm_api` REST API (address configured via `VITE_API_PROXY_TARGET`, see `.env.example`)

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
- Dev target: set `VITE_API_PROXY_TARGET` in a local `.env` (see `.env.example`); defaults to `http://localhost:8080`
- Wired up in `vite.config.ts`

## API Specification

Relative to your `VITE_API_PROXY_TARGET` backend:

**OpenAPI Spec**: `<backend>/api-docs/openapi.json`
**Swagger UI**: `<backend>/swagger-ui/`

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

## Dual-skin architecture

`zm-dashboard` ships **two skins on one codebase**:

- **Mission Control** (modern, opinionated dashboard) — dark cyan, panels, adaptive layouts, live thumbnails.
- **Classic ZoneMinder** (legacy-style) — top nav + dense white tables, for operators migrating from the PHP UI.

Selection lives in `useUiStore.skin` (persisted) and is honoured by `<AppShell>` in `src/skins/AppShell.tsx`. Every route renders the same data via shared hooks/features (`src/features/<feature>/…`); only the layout primitives differ. The classic top nav is in `src/skins/classic/shell/TopNav.tsx`; the modern Sidebar in `src/components/layout/Sidebar.tsx`.

A URL hint `?skin=modern|classic` switches once (`src/routes/__root.tsx`). Operators also pick in Settings → Appearance.

## Implementation Plan — Full-parity legacy-UI replacement

The P0–P10 phases below shipped their initial versions (plus follow-on work through ~P28 — see git history). **The dashboard is NOT yet feature-equivalent to the legacy ZoneMinder UI.** A 2026-06-30 audit (each `legacy-requirements/*.md` spec vs the actual implementation, cross-checked against the live legacy box) measured **~56% per-feature parity**. The checkmarks below mean "a version shipped," not "full parity" — e.g. Filters (P6) lacks most legacy operators and Servers (P7) is create+delete only.

- **Solid / often better than legacy**: Console, Events, Watch (WebRTC live), Cycle, Logs, Groups, Reports, Run-State.
- **Weakest, needs work** (some backend-blocked): Audit gap-analysis (~22%), Devices/PTZ + X10 (~23%), Servers clustering (~30%), Zones motion-settings (~42%), Storage usage/scheme (~45%), Filters operators (~48%), Montage Review timeline, Monitor-editor field depth, Users permission matrix.

The prioritized parity backlog (frontend vs backend-blocked) lives in `legacy-requirements/PUNCH-LIST.md`. The bandwidth-profile sub-UI is deliberately omitted (see `MEMORY.md`).

- [x] **P0** — Two-skin foundation (UI store, AppShell, modern/classic shells, URL hint).
- [x] **P1** — Watch + integrated PTZ control surface on `/monitors/$monitorId` (D-pad, speed dial, zoom/focus rockers, presets, AUTO state). Capability-gated against `/api/v3/monitors/$id/ptz`.
- [x] **P2** — Montage Review (`/montagereview`): master clock + per-cell HLS playback, draggable timeline with event bars per monitor.
- [x] **P3** — Cycle (`/cycle`) + Classic Console table (`useConsoleData` shared by both skins).
- [x] **P4** — Events power features: Tags CRUD + chip editor, per-frame scrubber (`/api/v3/frames`), Tot/Avg/Max scores, Notes substring filter.
- [x] **P5** — Groups (`/groups`) + Logs viewer (`/logs`) with level + component filters.
- [x] **P6** — Filters (`/filters`) with rule-row builder + Auto-archive / Auto-delete actions; Reports (`/reports`); Audit (`/audit`).
- [x] **P7** — Options parity: existing `/settings` configs editor + new `/settings/sessions` (API tokens) + `/settings/servers` (clustering). **Bandwidth profile UI explicitly skipped** per user.
- [x] **P8** — Classic skin tables for Events list + Monitors list (the two highest-traffic routes).
- [x] **P9** — Header status strip (LOAD/CPU/MEM/DISK with warn thresholds) + interactive RUNNING toggle wired to `/system/startup` and `/system/shutdown` (confirms before stop).
- [x] **P10** — Polish: Settings → Appearance skin chooser, first-login skin hint, CLAUDE.md updated.

### Feature module layout

- `src/api/<feature>.ts` — typed wrappers per backend resource.
- `src/features/<feature>/` — skin-agnostic data hooks + headless logic (e.g. `useConsoleData`, `useReviewClock`, `RuleBuilder`).
- `src/routes/` — TanStack Router routes; route bodies dispatch on `useUiStore.skin` and render either the modern panel layout or a classic table.
- `src/skins/{modern,classic}/shell/` — the chrome (sidebar / header / top-nav / stat bar) chosen by `<AppShell>`.

## Conventions

- Use `@/` path alias for imports from `src/`
- Components use PascalCase filenames
- Routes use kebab-case or param syntax (`$paramName`)
- API functions are async and return typed responses
- Use TanStack Query for all data fetching (not raw fetch in components)
- Tailwind classes only - no CSS modules or styled-components

## Known Issues

- Route tree needs regeneration when adding new routes (run dev server). **Nesting gotcha**: with flat file routing, `monitors/$monitorId.zones.tsx` nests *under* `$monitorId.tsx`, which renders no `<Outlet/>`, so `/monitors/$id/zones` showed the Watch page instead of the editor. Fixed 2026-06-30 by un-nesting via the trailing-underscore convention (`$monitorId_.zones.tsx`) — same URL, standalone route.
- Bundle size warning (>500KB) - consider code splitting for production
- `npm run build` is green again as of 2026-06-30 (`tsc -b` went 356→0). Fix: `tsconfig.app.json` now declares `node` + `vitest/globals` types and `src/test/jest-dom-vitest.d.ts` pulls in the jest-dom matcher augmentation, so test files typecheck under the app config. `vitest.setup.ts` is deliberately kept OUT of `include` (the app config's `erasableSyntaxOnly` forbids its TS-only class syntax).
- Backend notes:
  - `/api/v3/daemons` returns empty array (no ZM daemons configured on test system)
  - Storage stats not available from `/api/v3/system/status`

## Related Projects

- `zm_api` - Rust REST API backend for ZoneMinder
