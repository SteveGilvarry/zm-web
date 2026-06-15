# zm-dashboard

A modern React web dashboard for [ZoneMinder](https://zoneminder.com/) surveillance systems, built to replace the legacy PHP UI. It consumes the [`zm_api`](#related-projects) Rust REST backend and ships **two skins on one codebase**:

- **Mission Control** — an opinionated dark "command center" theme with panels, adaptive layouts, and live thumbnails.
- **Classic ZoneMinder** — a legacy-style top nav with dense tables, for operators migrating from the PHP UI.

The skin is chosen at runtime (Settings → Appearance, or a `?skin=modern|classic` URL hint) and persisted; every route renders the same data through shared hooks, only the layout primitives differ.

## Features

- **Live view & Watch** — per-monitor live streaming over WebRTC (low latency) or HLS, with an integrated PTZ control surface (D-pad, speed/zoom/focus, presets, AUTO state) gated on monitor capabilities.
- **Events** — browse, filter, and play back recorded events with codec-aware playback (direct progressive MP4 for H.264, HLS for HEVC, download fallback for unsupported codecs), a per-frame scrubber, tags, notes, and scores.
- **Montage & Montage Review** — multi-camera grids and a synchronized master-clock timeline with per-monitor event bars.
- **Cycle** — auto-cycling single-camera view.
- **Console** — at-a-glance monitor status (modern panels or classic table).
- **Groups, Filters, Logs, Reports, Audit** — full parity with the legacy UI, including a rule-row filter builder with auto-archive / auto-delete actions.
- **Settings** — config editor, API tokens/sessions, and clustering servers.
- **System status** — header strip with LOAD/CPU/MEM/DISK thresholds and a RUNNING toggle wired to system startup/shutdown.

## Tech stack

- **React 19** + **Vite 7** + **TypeScript**
- **TanStack Router** (file-based routing) and **TanStack Query** (data fetching)
- **Zustand** for auth/UI state
- **Tailwind CSS v4** for styling
- **hls.js** for HLS playback; native WebRTC for live streaming
- **Vitest** + Testing Library (unit) and **Playwright** (e2e)

## Getting started

### Prerequisites

- Node.js 20+ (developed on Node 24)
- A running [`zm_api`](#related-projects) backend reachable from your machine

### Install

```bash
npm install
```

### Configure the backend

The Vite dev server proxies `/api` requests to the `zm_api` backend. Set the target in a local `.env` file (gitignored):

```bash
cp .env.example .env
# then edit .env:
# VITE_API_PROXY_TARGET=http://your-zm-api-host:8080
```

If unset, it defaults to `http://localhost:8080`.

### Run

```bash
npm run dev        # start the dev server (default http://localhost:5173)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with the `/api` proxy |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests once (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:ui` | Vitest interactive UI |
| `npm run test:e2e` | Run Playwright e2e tests |

## Project structure

```
src/
├── api/        # Typed REST client + per-resource endpoint wrappers
├── components/ # common/ (Panel, …), console/, layout/
├── features/   # Skin-agnostic data hooks + headless logic per feature
├── routes/     # TanStack Router file-based routes (dispatch on skin)
├── skins/      # AppShell + modern/ and classic/ chrome
├── stores/     # Zustand stores (auth, UI)
├── streaming/  # WebRTC manager + HLS hooks
├── types/      # Shared TypeScript interfaces + helpers
└── index.css   # Tailwind v4 theme and utilities
```

See [`CLAUDE.md`](./CLAUDE.md) for deeper architecture notes (dual-skin design, API response conventions, streaming internals).

## API conventions

A few backend quirks worth knowing (full details in `CLAUDE.md`):

- Paginated responses use `{ items, total, per_page, current_page, last_page }`.
- Boolean fields come back as integers (`0 | 1`) — use the `toBool()` helper.
- Date fields are snake_case (`start_date_time`, `end_date_time`).
- All live stream endpoints require a JWT, passed via `Authorization: Bearer` or a raw `?token=` query param (WebSockets must use `?token=`).

## Related projects

- **[`zm_api`](#)** — the Rust REST API backend for ZoneMinder that this dashboard consumes.

## License

Private project — not currently licensed for redistribution.
