# Agent Context (CLAUDE)

This file is high-signal context for coding agents (Claude Code) working in this repository.

## Project Summary

`zm-web` is ZoneMinder's web interface rewritten in React: the replacement for the PHP UI in ZoneMinder's `web/`. It talks only to `zm-api` — there is no PHP in the stack.

- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4, semantic tokens per skin and colour scheme (see `docs/DESIGN.md`)
- **Routing**: TanStack Router (file-based routing)
- **Data Fetching**: TanStack Query
- **State Management**: Zustand (auth store)
- **Backend**: Consumes `zm-api` REST API (address configured via `VITE_API_PROXY_TARGET`, see `.env.example`)

## Design

**`docs/DESIGN.md` is the standard for the modern skin — read it before changing any modern page.** In short: a content-first ops console. Video is the only saturated thing on screen; colour means state, never decoration; tables beat cards; system UI at 13–14 px with monospace reserved for data that lines up; dark and light both designed.

Structurally: the shell is a fixed frame (`h-screen`, pages scroll inside their own region), chrome is one 44 px line with occasional controls behind a `ToolbarDisclosure`, and the content owns everything else. Forbidden in pages: raw colour classes (`cyan-*`, `emerald-*`…), gradients, glow shadows, `text-[10px]`, uppercase tracking on data labels, decorative animation.

Classic is out of scope for all of that — it is a faithful reproduction of ZoneMinder 1.39, quirks included.

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

# Start dev server (proxies /api to zm-api backend)
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## Testing

- Unit: `npm test` (vitest + RTL + MSW; coverage over all of `src/**` with thresholds — `npm run test:coverage`).
- E2E, seeded (hermetic, preferred): `npm run e2e:seed:up` (MariaDB from zm-api's docker recipe on :3308, loads `e2e/seed/seed.sql`), `npm run e2e:seed:api` (zm_api against it), then `npm run test:e2e:seeded`. See `e2e/seed/README.md`.
- E2E, live: `npm run test:e2e` against `VITE_API_PROXY_TARGET` with `TEST_USERNAME`/`TEST_PASSWORD` (no fallback). It mutates the box (notes, archive flags) — only against a dev box.

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

The Vite dev server proxies `/api` requests to the zm-api backend:
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

## Skin architecture

`zm-web` ships **two skins on one codebase**, and skins are real packages, not a theme toggle (contract: `src/skins/README.md`):

- **Modern** (`src/skins/modern/`) — the content-first ops console (`docs/DESIGN.md`); also the *fallback* skin.
- **Classic ZoneMinder** (`src/skins/classic/`) — legacy layout for operators migrating from the PHP UI; fidelity target is ZM 1.39 on the dev box.

Each skin exports a `SkinDefinition` (`id`, `Shell`, `rootClass` for its tokens, `pages`) and is registered in `src/skins/registry.ts`. Pages are auto-discovered from `src/skins/<id>/pages/<pageKey>.tsx` (default export, lazy — one chunk each). **Routes are thin**: `src/routes/**` only parses params and renders `<SkinPage page="events.list" />`. **All data, state and handlers live in `src/features/<feature>/use<Page>Page.ts` hooks** shared by every skin. Never branch on `useUiStore(s => s.skin)` inside pages/features — a skin *is* the branch. A page a skin lacks renders the fallback skin's page wrapped in `data-skin-fallback` (dev warning); `src/skins/registry.test.ts` keeps the explicit allow-list of borrowed classic pages — shrink it, never grow it silently.

Selection: `useUiStore.skin` (persisted), URL hint `?skin=modern|classic` (validated against the registry in `src/routes/__root.tsx`), Settings → Appearance (built from the registry). Tokens: semantic classes (`bg-surface`, `text-text-primary`, …) bound per skin under `.skin-<id>` in `src/index.css`.

## i18n and direction

All user-visible text goes through `t('English text')` (react-i18next; key = English). `npm run i18n:extract` regenerates `src/locales/en/translation.json`; `npm run i18n:check` is a CI gate. Seed other languages from ZoneMinder's `web/lang/*.php` with `npm run i18n:seed -- --zm ../ZoneMinder`. Layout uses **logical** Tailwind utilities only (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`); `scripts/codemod-logical-css.mjs` rewrites physical ones. Directional icons get `rtl:-scale-x-100`; physical media (video, montage wall, timelines, PTZ pad, zone editor, charts) sits in `dir="ltr"`. Details: `docs/I18N.md`.

## Implementation Plan — Full-parity legacy-UI replacement

The P0–P10 phases below shipped their initial versions (plus follow-on work through ~P28 — see git history). **The dashboard is NOT yet feature-equivalent to the legacy ZoneMinder UI.** The checkmarks below mean "a version shipped," not "full parity."

**Current plan of record: `docs/PRODUCTION-READINESS-PLAN.md`** (review 2026-08-21, status current to 2026-08-23). A nine-agent review verified every feature against the live legacy UI and live zm-api and measured **~42% functional parity, ~38% classic-skin fidelity, 54% real test coverage** (the earlier 56%/76% figures counted "a version shipped" and only test-imported files).

**Where it stands now:** the P0/P1 gap register (plan §4) is closed except **F-23** — the refresh token still lives in `localStorage`, pending zm-api#34. Every flow the review found broken is fixed: filters round-trip ZoneMinder's `terms` format, Add/Clone monitor works, zone coords stay in pixels (and the four corrupted dev-box zones were repaired), storage edit PATCHes, secrets are masked. Tests are 3,506 across 277 files at ~95% statements with 482 seeded e2e; CI gates `main` on five required checks. **Parity itself has not been re-measured since the review** — treat the percentages above as the last measurement, not as today's. The remaining work is plan §6/W9 and the Phase 3 row in §9.

Detailed per-area evidence: `legacy-requirements/review-2026-08-21/` (local, gitignored). The older `legacy-requirements/PUNCH-LIST.md` is superseded by that review.

**Reference version**: the classic skin's fidelity target is the ZoneMinder **1.39** UI on the dev box (not 1.38.3). The bandwidth-profile sub-UI is deliberately omitted (see `MEMORY.md`).

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
- `src/routes/` — TanStack Router routes; each renders `<SkinPage page="…" />` and nothing else.
- `src/skins/<id>/{Shell.tsx,pages/,layouts/,components/}` — per-skin chrome and page layouts; `src/skins/registry.ts` is the only place skins are listed.

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

- `zm-api` - Rust REST API backend for ZoneMinder
