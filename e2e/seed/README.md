# Seeded (hermetic) e2e

The default `npm run test:e2e` drives the dashboard against whatever zm-api
your `.env` points at, usually a real ZoneMinder box. That catches real-camera
bugs but it is slow, shared, and its data drifts. This directory adds a second
mode, `E2E_MODE=seeded`, that runs the same specs against a throwaway MariaDB
with fixed rows and a local zm-api. Nothing here talks to a real box.

## What it reuses from zm-api

zm-api already has a docker test-database recipe for its own integration
tests. We drive that recipe instead of copying it:

| Piece | Where it comes from |
|---|---|
| MariaDB 11.8 container | `zm_api/scripts/db-manager.sh mysql` (same image, flags and credentials as `zm_api/docker-compose.test.yml`) |
| ZoneMinder schema + stock seed (Controls, MonitorPresets, Manufacturers/Models, triggers) | `zm_api/zm_create.sql.in` + `zm_api/db/*.sql`, inlined by `db-manager.sh`'s `process_schema` |
| zm-api config | `zm_api/settings/test-db.toml` plus env overrides (no file edits in zm-api). `api.sh` exports both spellings, `APP_DB__HOST` (zm-api ≥ 725fc75, the documented form) and `APP__DB__HOST` (older builds), so either checkout picks them up |
| JWT keys | `zm_api/scripts/generate-jwt-keys.sh` (run automatically by `api.sh` if `static/key/` is empty) |

The zm-api checkout is located via `ZM_API_DIR` (default `../zm_api`, a
sibling of this repo). The schema is never vendored into this repo.

The e2e DB is started under its own container name and port so it can run
next to zm-api's own test DB:

|  | zm-api integration tests | dashboard seeded e2e |
|---|---|---|
| container | `zm-api-mysql` | `zm-e2e-mysql` |
| host port | 3307 | **3308** |
| database / user | `zm_test` / `zmuser:zmpass` | same |

Keeping them apart matters: zm-api's suite asserts a clean table state
(`fixture-doctor` fails on leftover rows), and our seed is deliberately
persistent. Set `E2E_DB_CONTAINER` / `E2E_DB_PORT` if you want otherwise.

## Running it

```bash
# 1. database: start MariaDB, load the schema (first time only), load the seed
e2e/seed/up.sh

# 2. backend: zm-api from ../zm_api against that DB, on http://127.0.0.1:8089
e2e/seed/api.sh            # foreground; add --release to build optimised

# 3. tests (another shell). Starts its own Vite dev server on :5174 that
#    proxies /api to the seeded zm-api.
E2E_MODE=seeded npx playwright test

# between runs, if a spec mutated fixture rows
e2e/seed/reset.sh          # reloads seed.sql only, ~1 s

# when done
e2e/seed/down.sh           # removes the container (and its data)
```

`up.sh` is safe to re-run: if the container is up and the `Monitors` table
exists it skips the (slow) schema load and only reloads the seed. Loading the
seed is itself idempotent: every block deletes its own 9000-range ids first.

Requirements: Docker Desktop or Podman (`DB_RUNTIME=docker|podman`), a Rust
toolchain for zm-api, and ffmpeg dev libraries for its build (see zm-api's
README). No host `mysql` client is needed; SQL is piped into the container's
own `mariadb` binary. No sudo.

### Env knobs

| Var | Default | Meaning |
|---|---|---|
| `E2E_MODE` | `live` | `seeded` selects this mode in `playwright.config.ts` |
| `ZM_API_DIR` | `../zm_api` | zm-api checkout |
| `E2E_DB_PORT` / `E2E_DB_CONTAINER` | `3308` / `zm-e2e-mysql` | MariaDB host port / container name |
| `E2E_API_PORT` | `8089` | port `api.sh` binds zm-api to |
| `E2E_API_URL` | `http://127.0.0.1:8089` | where Playwright's preflight and the Vite proxy look for zm-api |
| `E2E_BASE_URL` | `http://localhost:5174` | dev-server URL Playwright drives in seeded mode |
| `E2E_WORKERS` | `2` | Playwright workers in seeded mode (live mode is always 1) |
| `E2E_REUSE_SERVER` | unset | `1` lets Playwright reuse a dev server already on the seeded port |
| `E2E_API_WAIT_SECS` | `30` | how long the preflight waits for zm-api health |
| `TEST_USERNAME` / `TEST_PASSWORD` | seeded admin | override the login the fixtures use |

`api.sh` also sets `SERVER__MIDDLEWARE__AUTH_RATE_LIMIT_BURST=0`. zm-api
throttles `/auth/*` to one token per 2 s per IP; every worker here comes from
127.0.0.1, and a suite this size otherwise trips it and the sign-in starts
failing with "Login failed". Brute-force protection is not something a
throwaway database needs.

zm-api's `test-db` profile binds `127.0.0.1` only. `api.sh` overrides the DB
connection (`DB__HOST/PORT/USERNAME/PASSWORD/DATABASE_NAME`) and the listen
port (`SERVER__PORT`) through the environment, and exports each variable
under both prefixes: `APP_` (what zm-api's docs write, honoured from commit
725fc75 / zm-api#38) and `APP__` (what older loaders actually read). Whichever
zm-api checkout you point `ZM_API_DIR` at, the overrides take; with only one
form set on the wrong build you silently get the profile's `zm_test_user`
credentials. zm-api's startup migrations stamp the externally created schema
as baseline and add its own tables, nothing else.

### Preflight

`e2e/global-setup.ts` runs once before the workers. It polls
`/api/v3/server/health_check` and then logs in as the seeded admin. Either
failing aborts the run with the commands to fix it, so a forgotten `api.sh`
or an unseeded DB shows up as one clear error instead of forty timeouts.

## The seed

`seed.sql` loads deterministic rows with ids in the **9000 range** and names
prefixed **`e2e-`**. Stock rows the schema ships (user `admin` = 1,
`PurgeWhenFull` = 1, `Default` storage = 1, state `default` = 1, preset
montage layouts 1-11) are left in place. Specs should import ids from
`seed-data.ts` rather than picking "the first row".

Logins (plaintext on purpose; these only exist in this throwaway DB):

| user | password | rights |
|---|---|---|
| `e2e-admin` | `e2e-admin-pass-not-secret` | everything (Monitors `Create`, System `Edit`) |
| `e2e-viewer` | `e2e-viewer-pass-not-secret` | `View` on Stream/Events/Monitors/Groups/Snapshots, `None` on Control/Devices/System |

zm-api verifies passwords with the `bcrypt` crate (`src/util/password.rs`)
and only finds users with `Enabled=1 AND APIEnabled=1`. The stored hashes are
`$2y$10$` bcrypt, the same prefix ZoneMinder's PHP `password_hash()` writes.
To change a password: `htpasswd -nbBC 10 x 'new-pass' | cut -d: -f2`.

Contents:

- **Server** 9001 `e2e-server-1` (Running, CPU/mem stats), **Storage** 9001
  `e2e-events` (`DiskSpace` = sum of its events), a handful of `Config` rows
  named `ZM_E2E_*`.
- **Monitors** 9001-9004, all Ffmpeg/RTSP with TEST-NET-2 addresses so zmc
  could never connect: `e2e-Front Door` 1080p ROTATE_0 Modect,
  `e2e-Driveway` 720p **ROTATE_90**, `e2e-Garage` 1080p **ROTATE_270**
  Record/no analysis, `e2e-PTZ Dome` 720p Mocord with `Controllable=1`
  pointing at **Control** 9001 (a copy of the stock Ffmpeg Pelco-D profile)
  and three `ControlPresets`. Each has a `Monitor_Status` row (three
  connected, the dome NotRunning) and one full-frame **Zone** in pixel
  coordinates with legacy default thresholds.
- **Events** 9001-9032, newest first, 90 min apart over the last ~46 h.
  Width/Height/Orientation are joined from the monitor. Mixed causes
  (Motion, Continuous, Forced Web, Linked), lengths from 2.9 s to 600 s,
  six archived (`9005, 9010, …, 9030`), one still open (9001, no
  `EndDateTime`), `e2e:`-prefixed notes on about half for the notes filter.
  Events 9002 and 9003 have 10 **Frames** each (frames 4-6 Alarm).
  `Events_Hour/Day/Week/Month`, `Events_Archived` and **`Event_Summaries`**
  are computed from those rows (the schema's insert trigger is commented
  out upstream; zmc/zmstats normally maintain them).
- **Tags** `e2e-person`, `e2e-vehicle`, `e2e-false-alarm` with seven
  `Events_Tags` links.
- **Groups** `e2e-Outdoor` (monitors 9001, 9002, 9004) and child `e2e-Front`
  (9001).
- **Filters**, one per wire format the page has to cope with. 9001
  `e2e-PurgeWhenFull`: the stock `{"terms":[…]}` query_json verbatim (legacy
  `attr/op/val/cnj/obr/cbr` tokens), `AutoDelete=1`, `Background=1`. 9002
  `e2e-Motion only`: the dashboard's **retired** `{"rules":[…]}` shape — the
  rule builder no longer reads it and must say so with Save disabled instead
  of overwriting it. 9003 `e2e-Recent motion`: a readable `{"terms":[…]}`
  filter with no destructive action, for the match preview. **Report** 9001
  `e2e-Weekly motion` references filter 9002.
- **States** `e2e-Night`, `e2e-Away` in the `id:Capturing:Analysing:Recording`
  definition format; `default` stays active.
- **MontageLayouts** 9001 `e2e-Wall`: legacy gridstack positions, a flat
  `[{monitor_id,x,y,w,h}]` array on a 12-column grid.
- **Logs** 9001-9200: 200 rows 37 s apart covering every ZoneMinder
  severity — `-4` PNC ×10, `-3` FAT ×10, `-2` ERR ×20, `-1` WAR ×40,
  `0` INF ×100, `1` DBG ×20 — so the level filter has rows at each stop.
  Components `zmc_m9001`, `zma_m9002`, `zmdc`, `zmfilter`, `web_js`.

Timestamps are relative to `NOW()` at load time (container clock, UTC), so
the "last 24 h / 48 h" views stay populated however old the container is.
Run `reset.sh` to re-anchor them.

## Writing seeded specs

- Reference rows through `SEED` from `seed-data.ts`; do not depend on list
  order or on counts that another spec might change.
- Assert on roles, accessible names, testids and the HTTP requests that go
  out. Never on class names: the design tokens move.
- Tag the test title `@route:<pageKey>`. `e2e/route-coverage.spec.ts` reads
  `src/skins/pageKeys.ts` and fails when a page key has no tagged spec.
- Cover both skins. `gotoSkin(page, path, skin)` from `e2e/fixtures.ts`
  applies `?skin=` and waits for `<html data-skin>` before returning.
- Seeded mode runs with more than one worker and two browser projects at
  once, against one database. A spec that mutates a row must take one no
  other spec touches and put it back:
  - `scratchEvent(project, skin)` — one reserved event per (project, skin),
    out of `SEED.events.scratch`.
  - `scratchEvents(project, skin, n)` — a disjoint run of `n`, out of
    `SEED.events.scratchBulk`, for the bulk-action specs.
  - `scratchMonitor(project)` — one monitor whose free-text fields are safe
    to edit.
  - Anything created from scratch is named `e2e-probe-*` and deleted in a
    `finally`, through `apiFetch(page, …)` so cleanup does not depend on the
    UI being in a good state.
- Do not assert an exact count of something another spec mutates. The
  archived-events count, for instance, is asserted as "at least the six the
  seed archives", because the archive round-trip specs run in parallel.
- Signing in happens once per worker (`adminStorageState` in `fixtures.ts`)
  and every test inherits it. A spec that must start signed out declares
  `test.use({ storageState: ANONYMOUS })`.
- `reset.sh` between runs is the blunt instrument if a spec leaves debris.

## What the suite covers

| File | What it holds |
|---|---|
| `routes.spec.ts` | One happy path per page key per skin, driven off `e2e/routes.ts` |
| `console` / `events` / `event-detail` / `watch` / `zones` / `montage` / `montagereview` / `cycle` / `filters` / `groups` / `logs` / `reports` / `audit` / `settings` | Per-feature depth: filters, sorting, paging, and each mutation's request shape |
| `bulk-events` / `monitor-edit` | The mutation round-trips, on reserved rows |
| `failures.spec.ts` | Backend 500 → unreachable state; expired refresh → `/login?reason=expired`; a 403 → the forbidden state; a failed `/live/start` → the error tile |
| `a11y.spec.ts` | axe on every route in both skins, ratcheted against `a11y-baseline.json` |
| `mobile.spec.ts` | The 390 px project: no horizontal overflow, drawer opens and closes |
| `route-coverage.spec.ts` | Fails when a page key in `src/skins/pageKeys.ts` has no `@route:`-tagged spec |
| `live-playback.spec.ts` / `console-live-rotation.spec.ts` | Live mode only — real media on a real box |

## Out of scope, on purpose

- **Live video.** There is no `zmc`, no stream socket, no HLS/WebRTC source.
  Monitor pages render, PTZ capability endpoints answer from the Controls
  row, but `<video>` never gets frames and event `DefaultVideo` files do
  not exist on disk. Specs that assert on actual playback or rotation of
  live video (`console-live-rotation`, the playback half of `events`) keep
  running in live mode on the nightly against a real box.
- **Daemon control.** `/system/status`, startup/shutdown and `zmdc` actions
  have no daemon to talk to; expect empty daemon lists.
- **X10 / Devices, Monitors_Permissions / Groups_Permissions ACL rows,
  Snapshots.** Not seeded yet; add when a spec needs them.
- **Postgres.** zm-api's compose file also starts Postgres for schema
  comparison; the dashboard only needs MariaDB.
