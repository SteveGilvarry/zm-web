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

## API Proxy

The Vite dev server proxies `/api` requests to the zm_api backend:
- Dev target: `http://localhost:8080`
- Configure in `vite.config.ts` if backend address changes

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
- [ ] Fix TypeScript build errors (path aliases)

### Phase 2: Monitor Views
- [ ] Monitors list page (`/monitors`)
- [ ] Monitor detail page (`/monitors/$monitorId`)
- [ ] Live streaming integration (HLS.js)
- [ ] Monitor status indicators
- [ ] Monitor controls (function toggle, etc.)

### Phase 3: Events
- [ ] Events list page (`/events`) with filtering/pagination
- [ ] Event detail page (`/events/$eventId`)
- [ ] Event video playback
- [ ] Event thumbnails

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

- TypeScript build has errors related to path alias resolution in tsconfig
- Route tree needs regeneration when adding new routes (run dev server)
- Some routes are stubs (monitors, events detail pages)

## Related Projects

- `zm_api` - Rust REST API backend for ZoneMinder
