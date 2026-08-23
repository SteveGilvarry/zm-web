# zm-web — Production Readiness Plan

_Review date: 2026-08-21; decisions recorded the same day (Section 11)._

_Review date: 2026-08-21. Reference: ZoneMinder **1.39.16** on the dev box (the legacy UI the classic skin must match), zm-api `3.0.0-alpha.1` (146 paths / 243 operations). Detailed evidence for every claim below lives in `legacy-requirements/review-2026-08-21/` (local, gitignored): nine reports, ≈2,500 lines, every finding cited to `file:line` or a live probe._

## 1. Verdict

> **Reading this later:** Sections 1–4 are the 2026-08-21 review as written. What has changed since is in the ✅ marks in Section 4, the Status column in Section 9, and the done log in Section 12. The headline percentages below are **not** current — the P0/P1 register is clear except F-23, but nobody has re-measured parity since the review, and the next reviewer should not treat the numbers here as today's.

The dashboard is a well-built **beta with the wrong sign on its own progress report**. The README says "feature-complete"; CLAUDE.md says ≈56% parity; measured against the live legacy UI and the live API it is **≈42% functional parity** and **≈38% classic-skin fidelity**. More important than the percentages: four things an operator would do in their first hour are broken against the real backend, one of them destructively.

What is genuinely good: the streaming stack (WebRTC/HLS, Safari paths, rotation), the auth refresh design, the API wrapper layer (94% covered), the pure-logic helpers, the Logs and Audit pages, the mosaic montage. 725 unit tests pass in 8 s; `tsc -b` is clean.

What is not: no deployment story, no CI, lint red on `main`, real test coverage 54% with routes at 18%, no error boundary, no permission model, classic skin is a white repaint on 17 of 22 routes, and a handful of wrappers that never matched the API spec (PUT vs PATCH, wrong paths, wrong field names) shipped because nothing checks wrappers against the OpenAPI document.

Estimated effort to a production 1.0 (both skins, full parity on everything the backend supports, release-grade tests): **≈150–170 engineer-days**, of which ≈110 is frontend feature/quality work and the rest test infrastructure. Backend-blocked items (Section 7) land as 1.1 as zm-api ships them. Calendar time depends on how much of it runs in parallel.

## 2. How this was measured

- Nine parallel reviews: five feature clusters (live view, events, monitor config, admin, legacy inventory), plus backend contract, production readiness, test quality, and a hands-on UX pass in a real browser (57 screenshots, both skins, desktop + 390 px).
- Every "backend-blocked" label was checked against the saved OpenAPI and, where ambiguous, probed live (read-only except for throwaway rows that were deleted).
- The 2026-06-30 punch list was re-verified rather than trusted. It overstated parity (it counted "a version shipped" as done) and mislabelled several items: zone motion settings are backend-blocked, not FE; Scan Network, monitor-status, filter preview and ONVIF discovery are FE-only, not blocked.
- **Reference version correction:** the dev box runs ZM 1.39.16, not 1.38.3. The specs and captures in `legacy-requirements/` were taken from it, so they are the right reference; Roles, the Menu/Display tabs, Encoder Templates and left-navbar mode are 1.39 additions. Six captures (`audit/options/storage/state/users/watch-single.png`) are mis-captures of other pages and need retaking.

## 3. Scorecard

Parity = functional parity with the legacy page (either skin). Fidelity = how close the classic skin looks to the legacy page. Tests = route-level unit / e2e. _Scores are from the 2026-08-21 review; after waves 1–4 every classic page has its own legacy layout and the P0/P1 rows in Section 4 marked ✅ are closed — a fresh measurement is the next review's job._

| Area | Parity | Classic fidelity | Route tests | Biggest problem |
|---|---|---|---|---|
| Console | 45% | 55 | none / smoke | No runtime status (fps/bandwidth/state) although `/monitor-status` exists; no Add/Clone/Edit/Delete/Select toolbar in classic |
| Monitors list | n/a | 20 | none / smoke | No legacy equivalent; in classic it should fold into Console |
| Watch + PTZ | 45% | 40 | none / partial | Classic plays rotated cameras sideways; modern has no Force Alarm; no scale/stills/download-image |
| Cycle | 40% | 35 | none / none | No classic layout, no filter bar, no stream/stills toggle |
| Montage | 45% | 45 | none / 3 | Modern cells have no name caption; classic is 4 s snapshots, not live; saved layouts incompatible with legacy gridstack format |
| Montage Review | 35% | 30 | none / none | 500-event cap silently drops events; no event filters; no pan/zoom/fit; no classic; broken by the timestamp bug |
| Events list | 50% | 50 | partial / 2 | No column sort, fixed page size, Cause filter is a no-op, error state missing, bulk Edit/View/Export missing |
| Event detail | 50% | 25 | yes / 1 | Prev/Next only works for a monitor's oldest 100 events; no Archive/Edit; no rate control; no keyboard shortcuts |
| Filters | 30% | 30 | none / 1 | **Rule edits never save; dashboard wire format incompatible with ZoneMinder's (data-loss risk)**; 10 of 43 attributes |
| Reports | 55% | 35 | yes / none | Chart sums to zero on live data (`length` is a string) |
| Audit | 20% | 60 | yes / none | Wrong semantic: shows lifetime counts, not the windowed gap/integrity report |
| Monitor editor | 40% | — | partial / 1 | Enum casing mismatch hides real values; bitmask as toggle; phantom fields; no V4L/decoder/colours; password in clear |
| Add / Clone / Probe / Presets | 10% | — | partial / none | **Add Monitor and Clone both 422 against the live backend**; no ONVIF discovery; no presets |
| Zones | 25% | 40 | partial / none | **Units toggle rewrites pixel coords as percentages and saves them** (a zone on the dev box is already corrupted); editor ignores rotation; Type/Units silently dropped on edit |
| PTZ control profiles / X10 | 15% / 0% | 45 | none / none | No editor; route linked from nowhere; X10 absent (FE-only, small) |
| Groups | 70% | 35 | yes / none | Re-parent silently dropped (backend); no classic table |
| Options | 55% | 25 | none / 1 | `ZM_AUTH_HASH_SECRET` rendered in clear; bandwidth/hidden categories shown; no tab rail in classic; admin pages unreachable from classic nav |
| Users | 40% | 40 | none / none | Password/name/perm edits silently dropped (backend accepts `email`,`enabled` only); no gating |
| Servers | 25% | 30 | none / none | No edit; live stats wrapper expects the wrong shape |
| Storage | 35% | 45 | none / none | **Edit and Enabled toggle 405 (PUT to a PATCH-only route), swallowed silently** |
| Run State | 80% | 30 | yes / none | Start/Stop/Restart on `/settings` have no confirm; unreachable from classic |
| Logs | 50% | 55 | none / none | Severity labels off by one; level filter semantics inverted (both FE label + BE) |
| Sessions ("API tokens") | 10% | n/a | none / none | Built on the PHP web-sessions table; "Create token" inserts junk rows |
| Auth / login | 70% | n/a | none / 3 | Logout never calls the API; transient refresh failure forces logout; no redirect-after-login |
| Shell / nav | modern 85 / classic 55 | — | none / 1 | Emoji icons in classic nav; no permission-gated nav; no mobile drawer; no 404/error page |

Cross-cutting: **permission gating exists nowhere** although the JWT already carries all eight permission levels; **backend-down renders as empty state** on 21 of 24 routes; **no error boundary**; **single 1.27 MB chunk**; **console opens one WebRTC session per monitor regardless of viewport**; 124 of 243 API operations wired, 95 unused, 3 wired-but-broken.

## 4. Fix now (before anything else)

These are verified live, not inferred. Order within the list is severity.

### P0 — data loss, broken core flows, security

| # | Problem | Where | Fix | Effort |
|---|---|---|---|---|
| F-1 ✅ | **Filters: edits never persist and the format is incompatible with ZoneMinder.** _Fixed 2026-08-21 (commit `fix(filters)`): legacy `terms` format round-trips byte-for-byte, actions are first-class columns, preview via `/filters/preview` where the AST allows, unreadable queries are read-only._ `updateFilter` sends `{name, query}`; the field is `query_json`. The dashboard writes `{rules:[…]}`; ZM and zm-api use `{terms:[{attr,op,val,obr,cbr,cnj}],sort_field,sort_asc,limit,skip_locked}`. Both real filters on the dev box (`PurgeWhenFull`, `Update DiskSpace`) load as "no rules". If the PUT bug is fixed naively, saving `PurgeWhenFull` writes an empty rule set with `auto_delete=1, background=1` and `zmfilter.pl` deletes every event. | `src/api/filters.ts:157-175, 206-211`; `src/routes/filters/index.tsx:64-126` | Rebuild the filter model on the backend's first-class columns (`auto_*`, `background`, `concurrent`, `lock_rows`, `execute_interval`, `user_id`) and the legacy `terms` shape for `query_json` (lossless round-trip). Delete the dashboard-private `{rules}` format and the `contains/starts/ends` operators. Until then, disable Save on any filter loaded from the backend. | M |
| F-2 ✅ | **Add Monitor and Clone return 422.** _Fixed 2026-08-21: `normalizeMonitor()` + `toCreatePayload()`; create → clone → delete verified live. Backend side: zm-api#18, #19._ Defaults send `orientation: ROTATE_0` (schema `Rotate0`), `rtsp2_web_type: mse` (`Mse`), omit required `restream`, include unknown keys; Clone re-POSTs the GET body (`deleted: 0` where a boolean is required, raw enum casing). After those, the backend rejects ZoneMinder's own defaults (`brightness=-1`, `storage_id=0`, `max_image_buffer_count=0`). | `src/api/monitors-crud.ts:14-153, 190-200` | Add a `normalizeMonitor()` response→request mapper (also fixes the editor's Orientation / Event Close Mode selects showing the wrong value on every monitor); fix defaults; coerce on clone. Backend ticket BT-02 for canonical casing and BT-20 for the default-value validation. | S (FE) |
| F-3 ✅ | **Zone units toggle corrupts geometry.** _Fixed: coords stay in pixel space whatever `Units` says, rotated cameras use view dimensions, and all four dev-box zones were rewritten to full-frame pixels via the API. Tests assert that Pixels→Percent→Pixels leaves the polygon byte-identical. The motion-threshold panel and writable Type/Units still wait on zm-api#22; `updateZone` sends `{name, polygon}` only and the editor renders the rest read-only rather than pretending._ `convertUnits` rescales the polygon to 0–100 and saves it as `coords`; ZoneMinder stores coords in pixels regardless of `Units`. Monitor 1's only zone on the dev box is now a 0% sliver (motion detection effectively off). The editor also uses un-rotated width/height for ROTATE_90/270 cameras, so vertices get clamped and the overlay is wrong. `PUT /zones/{id}` accepts only `name`,`polygon`, so Type/Units changes are silently dropped while the form shows them editable. | `src/features/zones/ZoneEditor.tsx:110-149`; `src/routes/monitors/$monitorId_.zones.tsx:46-47` | Keep coords in pixel space always; use rotated dimensions; disable Type/Units on edit until BT-05 lands. `Units` stays `Percent` (ZoneMinder's default for the "All" zone; the API cannot change it). | S + data repair |
| F-4 ✅ | **Storage edit / Enabled toggle fail with 405.** _Fixed 2026-08-21: PATCH, errors surfaced, contract test guards the verb._ Wrapper issues PUT; the route is PATCH-only. No `onError`, so the modal just stays open. The unit test asserts the wrong verb. | `src/api/storage.ts:20-25`; `src/api/storage.test.ts:60` | PATCH; add `onError`. | S |
| F-5 ✅ | **Secrets on screen.** _Fixed 2026-08-21: private/password configs masked, source password field masked, committed credential removed._ `ZM_AUTH_HASH_SECRET` (`private=1`) renders in clear; `title={config.value}` puts even `type=password` values in the hover tooltip; the monitor Source password is a plain text input. A real-looking admin password literal is committed in `e2e/fixtures.ts:11-12`. | `src/routes/settings/index.tsx:678`; `src/features/settings/TypedConfigInput.tsx:152-156`; `src/features/monitors/editor/fields.ts:198` | Honour `private`; drop the tooltip; mask the field; remove the fallback credential and fail fast if env is unset; document `TEST_USERNAME`/`TEST_PASSWORD` in `.env.example`. | S |
| F-6 ✅ | **Sessions page writes junk.** `/sessions` is ZM's PHP web-session table (`access` is a Unix timestamp, `data` is serialised PHP). The page labels `access` as a permission bitmask and "Create token" inserts fabricated rows. | `src/routes/settings/sessions.tsx`; `src/api/sessions.ts` | _Fixed 2026-08-21: page, API wrapper, test and nav entry removed_ — the REST API is sessionless; long-lived API keys are a backend feature (zm-api#27). | S |
| F-7 ✅ | **No deployment path.** _Fixed 2026-08-21: Dockerfile + nginx/Caddy + runtime API base + docs/DEPLOYMENT.md; image smoke-tested in CI._ No Dockerfile, no proxy sample, no `base`, API prefix is a build-time constant, nothing documents SPA fallback + `/api` proxy + WebSocket upgrade for `/api/v3/live/*/webrtc/ws`. | repo root; `vite.config.ts`; `src/api/client.ts:4` | Multi-stage Dockerfile → nginx; sample nginx and Caddy configs; `VITE_BASE` + runtime-configurable API base (`/config.json` or `window.__ENV__`); README "Production" section. | M |
| F-8 ✅ | **No CI, lint red.** _Fixed 2026-08-21: ci.yml with blocking lint, tests + coverage thresholds, i18n check, build, audit, container smoke test; lint 0/0._ Only the CLA workflow exists; `main` has 34 lint errors / 24 warnings; CONTRIBUTING promises gates that do not run. | `.github/workflows/`; `eslint` output | `ci.yml`: `npm ci`, `tsc -b`, lint, `vitest run --coverage` (thresholds now configured), build, `npm audit --omit=dev`. Fix the 34 errors (7 `set-state-in-effect`, 8 `react-hooks/refs` in `StreamCell`, 14 `only-export-components`, 3 unused vars, 1 false-positive on Playwright `use`). | S + M |

### P1 — wrong every day

| # | Problem | Where | Effort |
|---|---|---|---|
| F-9 ✅ | _Fixed on the backend and consumed here._ **Event timestamps displayed ≈10 h ahead** (zm_api stamps server-local `DATETIME` values with `Z`; logs and monitor-status are correct UTC). Knock-ons: Montage Review shows "NO EVENT" in every cell, the Events "last hour" bound disagrees with the console, the date picker defaults to the UTC date. Root cause was backend (zm-api#16, now serving true UTC — verified against the wall clock), so no client-side offset hack was needed. `useDateTimeFormat` reads `GET /system/locale` (zm-api#33) for the server zone and ZoneMinder's three format patterns, which is the W7 formatter. | `src/routes/events/index.tsx:78-80, 667, 779-784`; `src/features/montagereview/useReviewEvents.ts` | S (FE) |
| F-10 ✅ | _Fixed (ZoneMinder scale end to end; server `>=` semantics labelled honestly; zm-api#21 for the rest)._ Logs severity labels off by one (live: `0=INF, -1=WAR, -2=ERR`; UI says `-1=ERROR, 0=WARNING, 1=INFO`) and the "Errors only / Info+ / Debug+" tiers return the wrong rows because the backend `level` is a numeric `>=` bound. Two tests enshrine the wrong map. | `src/api/logs.ts:45-64`; `src/features/logs/filter.ts:68-80`; `src/routes/logs/index.tsx:73-79` | S (+BT-04) |
| F-11 ✅ | _Fixed: time-bounded neighbour queries, verified live._ Event detail Prev/Next only works for the oldest 100 events of a monitor (page 1, id asc, no page targeting). | `src/routes/events/$eventId.tsx:136-156` | S |
| F-12 ✅ | _Fixed._ Reports chart sums to zero: `length` arrives as a decimal string and `Number.isFinite` rejects it. Same stale `ZmEvent.length: number` type hides it elsewhere. | `src/features/reports/bucketEventsByHour.ts:41`; `src/types/index.ts:214` | S |
| F-13 ✅ | _Fixed: client-side cause filter, `?archived=`, typed sort + headers, page size from `ZM_WEB_EVENTS_PER_PAGE`._ Events Cause filter is a no-op (not a backend param, not filtered client-side); `?archived=true` from Audit is parsed then ignored; `EventQueryParams.sort` advertises values the backend 400s on. | `src/routes/events/index.tsx:117, 159, 184-203`; `src/api/events.ts:24-27` | S |
| F-14 ✅ | _Fixed._ HLS `stop()`/unmount sends `DELETE /live/{id}/stop`, killing the backend session for every other viewer of that monitor (WebRTC deliberately never does). | `src/hooks/useHlsStream.ts:45, 172` | S |
| F-15 ✅ | _Fixed (reconnect, bounded retries, HLS fallback, authed stream calls, visibility pause)._ WebRTC ICE `failed`/`disconnected` never reconnects (only WS close triggers retry); `reconnectAttempt` resets on every `onopen`, so an accept-then-close backend loops at 1 s forever; HLS fatal network error retries forever with no backoff. | `src/streaming/webrtcManager.ts:193-201, 243-250`; `useHlsStream.ts:97-100` | S |
| F-16 ✅ | _Fixed (orientation, captions, live classic montage, gridstack-compatible layouts)._ Classic Watch ignores orientation (3 of 4 dev-box cameras render sideways); modern montage cells carry no name; classic montage is snapshots not live; existing gridstack saved layouts are hidden and new saves use a format legacy rejects. | `MonitorWatchClassic.tsx:180-195`; `routes/montage/index.tsx:358-365`; `MontageClassicGrid.tsx:163-169`; `SavedLayoutsMenu.tsx:26-79` | S / S / S / M |
| F-17 ✅ | _Fixed: pages through all events._ Montage Review fetches 500 events per monitor with no sort or paging; busy cameras and the 30-day window drop events silently. | `src/features/montagereview/useReviewEvents.ts:20-37` | S |
| F-18 ✅ | _Fixed: fields disabled with reason until zm-api#23._ User edit sends `password/name/phone/perms` that `UpdateUserRequest` (`email`,`enabled`) drops; UI reports success. Disable those fields with a reason until BT-06. | `src/api/users.ts:54-68`; `src/routes/settings/users.tsx:448-455` | S |
| F-19 ✅ | Monitor editor field types — _fixed 2026-08-21 with F-2 (bitmask select, phantom keys removed, `method` select). Backend rejects `save_jpe_gs` 2/3: zm-api#39._ | `src/features/monitors/editor/fields.ts:190-191, 237, 274, 311` | S |
| F-20 ✅ | _All three closed._ ~~Rotate Logs posts to `/system/log_rotate`~~; ~~logout wrapper uses POST and is never called~~ (now `GET /auth/logout`); ~~Start/Stop/Restart have no confirmation~~ — system actions on `/settings` run through `ConfirmAction` in `useSettingsOptionsPage`, and `/settings/state` apply and delete each go through a `ConfirmDialog`. | `src/api/system.ts:98-100`; `src/api/auth.ts:22-30`; `src/routes/settings/index.tsx:488-560` | S |
| F-21 ✅ | _Fixed: root ErrorBoundary, router error/404 inside the shell, QueryState, backend banner, no 4xx retries._ Backend-down renders as "No events found" / "No monitors configured" on 21 of 24 routes; no error boundary, no router `errorComponent`/`notFoundComponent`; `retry: 1` retries 4xx. | `src/main.tsx:15-25`; every route | M |
| F-22 ✅ | _Fixed: viewport × foreground × budget gating (`maxLiveTiles`, default 12), live by default per decision 7._ Console opens a WebRTC session per enabled monitor by default with no viewport gating (`useInViewport` exists, only `MonitorPreview` uses it). | `src/routes/index.tsx:71`; `src/components/common/StreamCell.tsx:170-178` | M |
| F-23 ◐ | _Referrer meta added, audit 0, devtools moved; refresh token stays in localStorage (the persistence e2e asserts it; revisit with zm-api#34)._ Both JWTs in `localStorage`; token in `?token=` on `<img>`, download links, Safari HLS and WS (lands in proxy logs and browser history); `npm audit --omit=dev` has 1 critical + 5 high (devtools declared as prod deps; `motion` unused). | `src/stores/auth.ts:160-167`; `package.json` | S now (audit fix, referrer meta, devtools→dev) / M (blob thumbnails, media tokens BT-24) |
| F-24 ✅ | _Fixed: accessible dialog with focus trap (wave 1), mobile drawer (wave 4), and in wave 5 a semantic light+dark token layer, every text/surface pair at AA with a stylesheet-parsing contrast test, one focus-visible ring, and prefers-reduced-motion._ Shared `Modal`/`ConfirmDialog` has no `role="dialog"`, `aria-modal`, focus trap or focus restore; zero `tabIndex`/`.focus()` in 26k LOC; modern shell has no mobile layout (fixed sidebar, page scrolls sideways at 390 px); contrast failures on `text-dim` (2.4:1) and `text-muted` on 11 px labels. | `src/components/common/Modal.tsx`; `src/skins/modern/Shell.tsx`; `src/index.css` | M |

| F-25 ✅ | _Fixed._ Montage Review pinned the playhead to the *old* range's edge when the new window did not overlap it: `applyRange` set the range and then the playhead, and the second call clamped against bounds React had not committed. `setRange(start, end, playhead?)` now does both in one call, clamping against the bounds being set. | `src/features/montagereview/useReviewClock.ts:45`; regression tests in `useReviewClock.test.ts` and `useMontageReviewPage.extra.test.ts` | S |

## 5. Skin direction

**Decided 2026-08-21: skins become real skins.** Implemented foundation (see `src/skins/README.md`): a skin is a self-contained package — its own shell, one lazy page component per route key auto-discovered from `pages/*.tsx`, its own token root class — registered once in `src/skins/registry.ts`. Routes are six-line lookups (`<SkinPage page="events.list" />`); all data, state and handlers live in `src/features/<feature>/use<Page>Page.ts` hooks shared by every skin; a page a skin has not implemented renders the fallback skin's page wrapped in `data-skin-fallback` with a dev warning, and `src/skins/registry.test.ts` keeps an explicit allow-list of borrowed pages so "white repaint" is visible and only shrinks on purpose. The route migration ran the same day; the classic rebuild of the six core pages is Phase 3 work and now has a place to land.

**Done 2026-08-22 (wave 5):** the token layer is semantic (`--bg/--surface/--fg/--accent/--ok/--warn/--danger` + ZM status aliases) and bound per skin *and* per colour scheme: Mission Control now has a **light theme** as well as dark, chosen by `useUiStore.theme` (`system|light|dark`, persisted, stamped as `data-theme` with an inline pre-paint bootstrap); classic stays light-only by design. `src/lib/contrast.test.ts` parses the real stylesheet and asserts every foreground×surface and intent×surface pair at AA (it reproduces the four review failures first, then requires them fixed) — two further failures it caught (white on emerald-600, white on crimson/80) are fixed too. Shared primitives (`Button`, `TextField`, `Select`, `Textarea`, `Checkbox`, `Badge`, `Chip`) live in `src/components/common` and are adopted in the shells and dialogs; pages adopt them next.

**Done 2026-08-22 (wave 7): the modern skin's information architecture, not just its palette.** The token retune that landed with wave 5 changed how the app looked and nothing about where the space went, which is a repaint, not a redesign. `docs/DESIGN.md` now carries the structural rules and the two highest-traffic pages are rebuilt around them:

- `ModernShell` is a **fixed frame** — `h-screen`, content column exactly one viewport, pages scroll inside their own region. That is what every `overflow-auto` main in the codebase already assumed.
- **Console** is the wall. One 44 px status line carries the readings, the running state and the thumbnail protocol; daemon detail and the seven filter chips are behind disclosures; the cameras fill the frame with no panel, no page padding and no nine-tile cap, with recent events in a collapsible rail. `packWall` (`src/features/console/layout.ts`) picks the row count that makes the smallest camera largest inside the measured box.
- **Events** is the table. One query line (name, monitor, archive state, Filters with an active count), rows filling the remaining height under a pinned header, totals and pager in a status bar.
- The **header** loses its four-reading telemetry strip and its always-green "Connected" badge — system readings belong to the console, not above every page — and the **sidebar's** sixteen equal links become Watch / Investigate / Configure.
- Colour is back to meaning state: the tile keeps it for lens, live mark, alarm border and an fps that has fallen behind; the sparkline, the 1H/24H/7D counters and the hover glow lose it. The pinging LIVE pill on every tile is one dot.
- A real bug fell out of it: the console held the filter result in state seeded from an empty monitor list, so with the bar behind a disclosure the wall came up empty. The filter is now a headless hook (`useMonitorFilter`) both the wall and the bar read.

**Done 2026-08-22 (wave 8): the pass finished, and the skin got its name.** All 23 modern pages and the shared feature components now follow the structural rules; "Mission Control" is renamed **Modern** everywhere (id, registry, picker, docs), which is what the skin had actually become. Four things fell out of finishing it:

- **Video fits its frame, in every aspect ratio.** Portrait cameras were laid out full-width on Watch, Cycle and the monitors list, so the bottom of the picture sat below the fold with nothing to scroll. `useStageFit` measures the available box and `stageFitStyle` fits to width or height by the camera's own ratio.
- **Event playback fits the page and pinches to zoom** (`usePinchZoom`: two-finger pinch, trackpad pinch, drag to pan, double-click to reset), shared with the live stage on Watch, which also gained a volume slider.
- **Rotated cameras play upright.** Chromium already applies the mp4 rotation tag, so the fix was to trust the decoded dimensions rather than re-rotate; only the poster still needs an explicitly rotated `<img>`.
- The README screenshots are regenerated from a committed script (`npm run screenshots`) with video blurred in-page, so they can be refreshed instead of re-staged by hand.

**Recommendation (unchanged): keep one codebase, replace "Mission Control" with a neutral light + dark token system, and rebuild the classic skin as a true legacy layout on the six pages operators live in (Console, Events, Event view, Watch, Montage/Cycle/Review, Options).** Do not ship classic-only, and do not keep polishing the cyberpunk look.

Why not classic-only for v1: classic is not a second product. The whole classic shell is 167 lines plus five tables; the other 17 routes render the modern panels on a white background. "Nearly identical to legacy" is L-sized work per page whatever happens to modern, so dropping modern saves almost nothing — and modern is where the working functionality lives (live thumbnails, rotation, column chooser, zone editor, mosaic).

Why not keep Mission Control: judged as an eight-hours-a-day tool it is dark-only with no theme state at all, uses 10 px uppercase mono labels for data (264 `font-mono`), has a secondary text colour at ≈2.4:1 contrast used 36 times, spends colour decoratively (a storage tile is green at 72% used while the header shows the same value neutral), shows 3.5 events per screen on the highest-traffic page, and has no mobile layout. None of that is polish; it is the theme's premise.

What it costs:
- **Tokens + primitives (M, ≈4 days):** a semantic token layer (`--bg/--surface/--fg/--muted/--accent/--ok/--warn/--danger`) with light and dark values; a codemod over the 635 `cyan*` class references in 71 files; shared `Button`, `Input`, `Select`, `Badge`, `Dialog` (built on `<dialog>` or a focus trap), `Table`, `QueryState`. This also fixes the a11y findings in one place. Today 189 `<button>`, 76 `<input>` and 32 `<select>` are styled inline.
- **Classic primitives (S–M):** flat Bootstrap-style table/form/filter-row/button components, Material Symbols for the nav (legacy's icon set), striped rows, `#337ab7` links, so classic pages stop leaking cyan pills and rounded cards.
- **Classic rebuild of the six pages (L, ≈12–15 days):** Console with checkbox column + toolbar + filter-input row + fps line; Events with the legacy filter form and bootstrap-table toolbar/footer; Event view with the dark control bar + full-width player + frames/stats; Watch with action row → stage (+PTZ) → full-width events table; Montage/Cycle/Review with Width/Height/Scale and the left monitor list; Options with the left tab rail. The remaining classic routes (Groups, Reports, Servers, Storage, PTZ, Users) can stay "neutral on white" — the legacy pages they replace are plain tables opened once a month.
- **Mobile drawer for the modern shell (S–M).**

Architecture rule that makes two skins sustainable: two *layouts* on one token and primitive system, never two visual languages. Route bodies dispatch on `skin` to a layout; data hooks and feature logic stay shared (the `src/features/` pattern already intends this).

## 6. Workstreams

### W1 — API contract layer (stops the next F-4 from shipping)

- ✅ **Done 2026-08-23.** `npm run types:generate` emits `src/types/api.generated.ts` from the tracked snapshot, and `src/types/api.contract.test-d.ts` asserts the hand-written shapes against it **at compile time** — a field whose declared type stops matching is a `tsc -b` error naming the field, at no runtime cost. Verified to fail by re-introducing F-12's bug (`ZmEvent.length` as `number`), which it caught.

  Two things this turned up. The drift the row was written for is **already gone**: comparing every declared field of `Monitor`, `ZmEvent` and `User` against the spec found *zero* type mismatches, so the value here is preventing the next one, not fixing the last one. And zm-api's spec ships **duplicate `operationId`s** — `list_models`, `create_model`, `get_model`, `delete_model`, `update_model`, `update_state` are each declared twice with different shapes — which makes the generated `paths`/`operations` blocks uncompilable; `scripts/generate-api-types.mjs` strips them and says why. That is zm-api#32 (spec hygiene) with a concrete reproduction.

  Original text: generate types from the OpenAPI document (`openapi-typescript`); replace the hand-written `src/types/index.ts` shapes that drifted (`Monitor.enabled`, `ZmEvent.length`, `ServerStats`, `MonitorRuntimeStatus`, `SystemStatusResponse.daemons`, `Control` missing 45 range fields, `ZmConfig` missing `pattern/format`, `UserClaims` missing `perms`, `EventVideoInfo.in_progress`).
- One contract test that loads the OpenAPI JSON and asserts, for every `src/api/*` wrapper: method + path exist; query params are declared; every select option in `fields.ts` is a member of its enum; every `fields.ts` key exists in `UpdateMonitorRequest`. This single test would have caught F-2, F-4, F-10, F-13, F-19, F-20.
- Response normalisers for the two enum vocabularies on monitors until BT-02 lands.
- Shared, schema-validated MSW fixtures (`makeMonitor()`, `makeEvent()` with string `length`, 0/1 ints, full required fields) replacing the 82 ad-hoc `setupServer()` blocks.

### W2 — Permission model

The JWT already carries `perms: {stream, events, control, monitors, groups, devices, snapshots, system}` with `None|View|Edit`. Add `perms` to `UserClaims`, a `usePerms()` selector, a `<RequirePerm feature level>` route guard (`beforeLoad`, not a `useEffect`), nav filtering in both shells, and read-only modes on every edit surface. This closes ≈15 "no gating" items across Console, Watch, Events, Groups, Options, Users, Servers, Storage, Logs, Run State, Montage, Review. Handle 403 distinctly from network errors.

### W3 — Reliability

Root `ErrorBoundary` + router `defaultErrorComponent`/`defaultNotFoundComponent` in both skins; `QueryCache` error subscriber driving a global "backend unreachable" banner; a `<QueryState isLoading isError onRetry>` wrapper used by every route; `retry` predicate that skips 4xx; `onError` toasts on every mutation (today only `state.tsx` and `MonitorEditor` surface errors); router navigation instead of `window.location.href` (three sites); only clear auth on 401/403 from `/auth/refresh`, back off otherwise; `requestFullscreen` feature detection (sync TypeError on iPhone); `visibilitychange` refresh-if-due.

### W4 — Streaming

F-14/F-15 above; pong deadline on keepalive; `visibilitychange` pause for backgrounded walls; HLS `start()` guard while connected (leaks a second `Hls`); Safari native-HLS token refresh and listener cleanup; streaming fetches through `authedFetch` (401 → refresh → retry like everything else); progressive-MP4 playback captures a 600 s token once (BT-24 for media tokens, or switch to HLS for long events); viewport-gated console tiles with a concurrency cap, snapshots by default with opt-in live; automatic HLS fallback when WebRTC ICE fails (no TURN story today); a shared `useMonitorStatuses()` polling `/monitor-status` at ≈5 s that feeds Console lens/pills/fps/bandwidth, Watch overlay, Montage captions, Monitors list.

### W5 — Performance & bundle

Route-level lazy loading (`*.lazy.tsx`), dynamic `import('hls.js')` (532 kB currently shipped to the login page), `manualChunks` for react/tanstack/hls, a size budget in CI; `staleTime`/interval review on the console's 8 queries (≈28 req/min baseline) and the 1000-event sparkline pull (BT-18 histogram endpoint); monitor list caps (100/50/24) replaced by paging or "load all" (API allows 1000); `useAuthStore` selectors (34 unselected call sites re-render on every refresh); header clock re-render isolation.

### W6 — Security & deployment

F-5, F-7, F-23 above; `<meta name="referrer" content="no-referrer">`; self-host fonts (air-gapped CCTV LANs; also needed for any CSP); CSP sample in the nginx config; remove `motion`; devtools to `devDependencies`; `npm audit fix`; Dependabot; `engines` + `.nvmrc`; document the TURN/STUN story; `beforeLoad` auth guard; consider sessionStorage for the refresh token now and an httpOnly cookie mode when zm-api offers one.

### W7 — Time, locale, config consumption

Central date/time formatter honouring `ZM_DATE_FORMAT_PATTERN` / `ZM_DATETIME_FORMAT_PATTERN` / `ZM_TIME_FORMAT_PATTERN` and a server timezone (BT-23), with the viewer's locale (header clock hard-codes `en-US`); the F-9 workaround lives here. Consume the `ZM_WEB_*` rows the dashboard already edits but never reads: `EVENTS_PER_PAGE`, `EVENT_SORT_FIELD/ORDER`, `LIST_THUMBS` + sizes, `ID_ON_CONSOLE`, `HOMEVIEW`, `POPUP_ON_ALARM` / `SOUND_ON_ALARM` / `ALARM_SOUND` (driven by `/monitor-status`), `TITLE`/`TITLE_PREFIX`/`CONSOLE_BANNER`, `SHOW_SERVER_STATS`, `OPT_CONTROL` / `OPT_X10` / `FEATURES_SNAPSHOTS` gates, `USER_SELF_EDIT`, `CHECK_FOR_UPDATES` + `ZM_DYN_*`. Set `document.title` per route. **Decided 2026-08-21: string extraction ships in 1.0.** Foundation in place (see `docs/I18N.md`): i18next + react-i18next with English-text keys, `npm run i18n:extract` / `i18n:check` (CI gate), lazy per-language catalogues, a seeder that copies exact-match translations from ZoneMinder's 27 `web/lang/*.php` files, and a language picker. Direction: `applyDirection()` sets `<html dir lang>`; layout uses logical CSS only (`scripts/codemod-logical-css.mjs` rewrites physical utilities), directional icons carry `rtl:-scale-x-100`, and physical media (video, montage wall, timelines, PTZ pad, zone polygons, charts) sits in `dir="ltr"`. Hebrew, Arabic and Persian are all RTL and all three now have catalogues — Arabic and Persian were offered in the picker with no file behind them until a catalogue test caught it.

**i18n status (2026-08-22).** Extraction rewrites all 26 catalogues, not just `en`, and `i18n:check` diffs the whole directory; before that the others had drifted 720 keys behind the UI. Seeding from ZoneMinder was reworked (trailing-punctuation-insensitive matching, abbreviation rejection) and went from ~2% to the ceiling: ZoneMinder ships **757** strings, this UI has **1,739**, and only **208 (12%)** overlap — no importer does better, and the rest needs translators. Each catalogue carries exactly its language's CLDR plural categories, and `src/i18n/catalogues.test.ts` guards servable languages, key parity, placeholder and `<Trans>`-index integrity, and those plural categories. The files are deliberately in the shape a git-backed translation platform reads without a reformat (`docs/I18N.md` records the properties and the two settings that must match); adopting one is the open decision. Vertical writing modes are an explicit non-goal for UI chrome (no ZoneMinder locale uses one); logical properties keep block/inline axes correct if one ever does, and physical media stays horizontal regardless.

### W8 — URL compatibility and keyboard

A `view=` compatibility router in `__root.tsx` mapping `?view=watch&mid=`, `?view=event&eid=` (emailed links, `%EPS%`), `?view=events&filter[…]`, `?view=montage&group=`, `?view=montagereview&MonitorId&minTime&maxTime`, `?view=cycle&mid=`, `?view=monitor&mid=`, `?view=zones&mid=`, `?view=options&tab=`, `?view=filter&Id=`, `?view=log|groups|reports|report_event_audit`, `?view=user&uid=`. Half a day; it is the difference between "replacement" and "second UI" for anyone with bookmarks. Event page shortcuts: ←/→ prev/next, Space play/pause, Delete, ↓ tag input. Put page state (page, sort, filters, selected filter id) in the URL everywhere.

### W9 — Feature parity build-out (frontend-only, backend already supports)

Ordered by daily use. Effort is per area, after W1–W3 are in place.

> **Re-verification, 2026-08-23 — this table is stale and badly overstates the remaining work.** Every area below was driven in a browser: first against the live dev box (ZM 1.39.16 / zm-api on `.45`), and after that box's API died mid-session, against the hermetic seeded stack. Static grep was tried first and contradicted itself in both directions within one pass, so **only in-browser observation is recorded here**.
>
> **Verified built** (budgeted days in brackets):
>
> | Area | | What is there |
> |---|---|---|
> | Events list | 8 d | Bulk View / Download / Edit / Archive / Unarchive / Delete; sort on 9 fields; column chooser (16); CSV export; refresh; pager with jump-to-page; tri-state archive filter; card/table toggle |
> | Filters | 6 d | Both real dev-box filters load **with their rules** — the F-1 symptom is gone. Condition builder, first-class actions, Sort by / direction / Limit / Skip locked / Execute interval, Preview, List matches, Export matches, Save As, Reset, Debug |
> | Watch / PTZ | 6 d | 8-way D-pad, Home, zoom (Wider/Near/Closer/Far), **preset slots with their names** from `/control_presets`, save/clear preset, Scale select, Stream/Stills, Force + Cancel Alarm, Download Image, fullscreen, WebRTC/HLS, function buttons, Details/Status/Motion-zones/Recent-events panels |
> | Montage Review | 5 d | 0.25×–16× speeds, Fit, zoom in/out, pan earlier/later, 1 h / 8 h / 24 h ranges, per-monitor filter, All events, Live |
> | Montage | 5 d | Display, Layout, split/remove tile, fullscreen, WebRTC/HLS, Restart |
> | Options | 5 d | Category tab rail with counts, per-row reset-to-default, help/prompt text, daemon control, Start/Stop/Restart/Rotate Logs, Appearance (skin, theme, language) |
> | Users | 3 d | Add / Edit / Delete, bulk delete, Export CSV + JSON |
> | Servers / Storage | 3 d | Servers: Register / Edit / Delete / Details with live CPU, Load, Free mem, Free swap columns. Storage: Add / Edit / Delete, Disk space, Events, Enabled |
> | Logs | 2 d | Level filters with live counts, Clear Logs, column chooser, CSV download, paging, refresh |
> | Audit | 3 d | The legacy gap semantic — Events / FirstEvent / LastEvent / MinGap / MaxGap / MissingFiles / ZeroSize / Server, monitor filter, refresh |
> | Cycle | 2 d | 5/10/20/30/60 s intervals, Stills toggle, prev/next monitor, pause, filter bar |
> | PTZ control profiles | 4 d | The full protocol list with Add profile |
> | Zones | 3 d | Zone list per monitor with New; editor reachable |
>
> That is **55 of the 75–85 budgeted days already spent.** The estimate below was written before the work was done and has not been revised since.
>
> **What the pass found open, and what was done about it:**
>
> - ✅ **Watch had no monitor navigation** — moving between cameras meant going back to the console. Fixed: `useWatchPage` exposes `siblings`/`prevMonitorId`/`nextMonitorId` off the shared `['monitors']` query; modern renders wrapping prev/next links with an `n/m` position, classic gets the legacy monitor dropdown in its action row. Verified in a browser (9002 → 9003).
> - ✅ **Two event timestamps bypassed the W7 formatter** — the modern Watch's Recent Events and the filter Matches preview called `toLocaleString()` directly, so the same event showed a different time there than on the Events list, ignoring ZoneMinder's format patterns and the server zone. Both now use `useDateTimeFormat`.
> - ✅ **Classic events table formatting** (2026-08-23). Diffed against 1.39.16: the 18 columns and their order already matched, but `DiskSpace` used the house `formatBytes` (`548 MB`) instead of ZoneMinder's `human_filesize` (`548.00MB`), and timestamps rendered in the viewer's locale (`Aug 23, 2026, 01:30:06`) where legacy renders `2026-08-23 10:59:17`. `useLegacyDateTimeFormat` now supplies ZoneMinder's patterns as the classic fallback — a pattern configured on the server still wins, and the modern skin keeps its locale-aware default. Monitor and storage names showing as `Monitor 1` / `1` turned out to be rate-limiting symptoms (zm-api#70), not lookup bugs.
> - Not a gap after all: **Watch's events panel.** Classic already has the full paginated `ClassicEventsTable` with a pager; modern shows recent events plus a "View all" deep link into the filtered events page, which is the right call for that layout.
> **The rest of the table, measured the same way — all built:**
>
> | Area | | What is there |
> |---|---|---|
> | Console (classic) | 5 d | Checkbox column, Add / Clone / Edit / Delete / Select toolbar, Scan Network, Zones / Server / Storage columns, Hour / Day / Week / Month event counts, column chooser, Export, Refresh, per-field filter clears, Sort + Reset sort order |
> | Event detail | 5 d | Archive, Edit, Delete, prev/next event, prev/next frame, Back/Forward 10 s, playback-speed and replay-mode selects, Scale, Show Zones, Stats, tag editor |
> | Monitor editor | 8 d | Nine legacy tabs; source-type-dependent fields incl. Decoder + hwaccel + device, target colourspace, deinterlacing, method, orientation, resolution preset, the four image adjustments, linked monitors, group membership |
> | Groups / Reports | 2 d | Groups: add / edit / delete with member counts. Reports: table with Filter / Interval / Range, new, delete |
>
> **Conclusion: every W9 area is substantially built.** Two genuine gaps came out of the whole pass, both now fixed (above). The 75–85 day Phase 3 estimate is spent; what remains for 1.0 is Section 10's release criteria, not W9 feature work.
>
> Backend findings from this pass are filed, not worked around: the duplicate `operationId`s as a reproduction on **zm-api#32**, and the login field rename as **zm-api#65**.
>
> One environment finding worth keeping: the dev box's zm-api (`.45:8080`) went down mid-session and stayed down for about an hour. (An apparent login-contract change was also recorded here and turned out to be my own bad probe — see zm-api#65, withdrawn.)

| Area | Work (all FE-possible today) | Effort |
|---|---|---|
| Events list | Server-side sort on the 8 supported fields + headers in both skins; page-size selector (`ZM_WEB_EVENTS_PER_PAGE`); legacy filter form (Group via `/groups-monitors`, Start ≤, real datetime lower bound — today's date-only input is pinned to UTC midnight); Bulk View / Edit (name, cause, notes, archived) / Download; columns End, Emailed, Storage name, Thumbnail (classic); cell deep-links; toolbar Refresh/Timeline/fullscreen/Export-visible-CSV; term persistence; server-side Notes/Tags via `/events-tags?event_id` until BT-03 | 8 d |
| Event detail | Archive/Unarchive, Edit form, playback rate 1/4×–16×, Frames table view, Montage Review deep link, EventData table (`/event-data?event_id=`), per-frame score histogram from frames already fetched, Storage/Path/Emailed rows, tag-and-next, classic layout | 5 d |
| Filters | F-1 rebuild; 16 more attributes from `FilterField`; Sort by / Asc / Limit / Skip locked / Run as; Unarchive / Update-disk-space / Upload actions; storage picker for copy/move; View Matches → Montage Review; Export matches (CSV of preview); Save As / Reset; `POST /filters/preview` for List Matches and Execute (replaces the client evaluator's 200-event replay; fix the evaluator's date comparisons until then); Debug shows the backend `filter` AST; classic single-form layout | 6 d |
| Monitor editor | F-2/F-19; type-dependent Source widgets incl. Local/V4L (`device`,`channel`,`format`,`palette`,`v4l_*`), `decoder` + hwaccel, `colours`, `rtsp_describe`, `sub_path`, image adjustments; `method`/`deinterlacing`/`default_rate`/`default_scale`/`storage_id`/`video_writer`/`return_location` as proper selects (`/storage`, `/control_presets`); General relationship fields: Manufacturer/Model with "enter new" (`/manufacturers`, `/models`), Groups multi-select (`/groups-monitors`), Linked monitors, Server, Decoding enabled, Refresh; Viewing: `rtsp2_web_type`, `default_codec`, `janus_profile_override` (load-bearing for Safari), `rtsp_user`, `janus_rtsp_session_timeout`; ONVIF: `onvif_events_path`, `onvif_alarm_text`, `soap_wsa_compl`; Misc: `min_section_length`, `section_length_warn`, `frame_skip`, `motion_frame_skip`, `fps_report_interval`, `signal_check_*`, `exif`, `startup_delay`, colour picker; validation; Save-and-Close / Delete / Watch / Zones in the rail; Control tab LIST link; classic form layout | 8 d |
| Add / Clone / Discover / Presets | F-2; ONVIF discovery wizard on `POST /discovery/probe` + `/inspect` (one-shot `/onboard` where the backend has it) and a Scan Network button on Console; monitor-presets picker (`/monitor_presets`); all source types in the Add dialog | 4 d |
| Console | Runtime status via `useMonitorStatuses` (lens, pills, Function fps/bandwidth, footer totals); classic checkbox column + Add/Clone/Edit/Delete/Select-bulk toolbar; Zones/Server/Storage/Manufacturer/Model columns; count deep-links; bootstrap-table toolbar (Refresh, columns, export, search, page size); filter bar parity (Name/Source regex, runtime Status, per-field clear, collapse); drag-reorder with optimistic update; remove the 9-monitor cap | 5 d |
| Watch / PTZ | ~~Force Alarm in modern~~; ~~F-16 orientation~~; ~~State/FPS overlay~~; ~~Scale + Width/Height~~; ~~Stream/Stills toggle + Download Image~~; cycle sidebar / monitor nav; full paginated events table (reuse `ClassicEventsTable`); ~~pan/zoom~~ (digital zoom on the received picture via `usePinchZoom`, shared with event playback); ~~volume slider~~; protocol switch after auto-start; PTZ preset labels (`/control_presets`), command error toasts, speed ranges from capabilities, click-to-centre via `moveRelative`; capability request gated on `controllable`; classic layout | 6 d |
| Montage | F-16 captions + live classic + layout format compatibility (read gridstack, write a format legacy accepts or keep the tree in `user_preferences`); Auto preset on fresh install; status-position and ratio selectors; Show Zones overlay (`/monitors/{id}/zones`); classic Edit-Layout mode; website monitors as iframes; fullscreen/protocol/restart in classic; remove the 50 cap | 5 d |
| Montage Review | F-17 paging + sort; Archived / custom datetime filters (tags/notes after BT-03); pan / zoom / Fit; scale slider; full speed list; consistent in-progress handling; `minTime/maxTime/MonitorId` URL params; classic layout; hover tooltip, double-click → Watch, `web_colour` tint | 5 d |
| Cycle | Classic layout (left monitor list, Width/Height/Scale, `<< \|\| \|> >>`); filter bar; Stream/Stills toggle; `?mid=` deep link; persist interval/position; refetch monitors | 2 d |
| Zones | F-3; Area column (px/%) + out-of-bounds badge; Mark checkboxes + bulk delete; points table with X/Y inputs; self-intersection warning; full-frame default; motion-settings panel once BT-05 lands; permission gate; classic list | 3 d (+3 after BT-05) |
| Options | F-5; classic `OptionsLayout` with the left tab rail (minus the three bandwidth tabs, `hidden`, `dynamic`); `x10` gated on `OPT_X10`; `Prompt` text per row; Pattern validation (translate the Perl regex); reset-to-default; "Save all dirty rows"; daemon control by `id`; Versions tab with `db_version`; Privacy consent on first run when `SHOW_PRIVACY` | 5 d |
| Users | F-18; list columns Control/Groups/Snapshots/Devices; System-permission gating + self-edit mode; group matrix tree; bulk delete; export; username pattern; search across pages | 3 d (+2 after BT-06) |
| Servers / Storage | Edit UI (`updateServer` exists); live stats from `/server-stats` (fix wrapper shape); `NotRunning` status; monitors-per-server; Storage Scheme/Server/Url fields (requests already accept them), delete guard via `/filters/preview` on `storage_id`, Events deep-link, protect `Default` | 3 d (+2 after BT-07/08) |
| Run State / header | Confirms on Start/Stop/Restart; one mechanism (header badge opens the state chooser like legacy); `updateState` rename; reachable from classic | 1 d |
| Logs | F-10; page-size selector; jump-to-page; auto-refresh toggle; row tinting by severity; component list from a large sample; label page-local search honestly until BT-04/14 | 2 d |
| Audit | Rewrite to the legacy semantic: time-window picker (default now-2h→now-1h), monitor filter bar (reuse `MonitorFilterBar`), per-monitor Events / First / Last / MinGap / MaxGap computed from `/events` paged per monitor, Server column, deep-links; MissingFiles/ZeroSize after BT-18; render errors | 3 d |
| PTZ control profiles | Full Add/Edit form (10 tabs, ≈95 fields; `Create/UpdateControlRequest` cover them); link from Sidebar, classic Options→Control, and the editor's Control tab; Protocol column, sort, delete guard listing referencing monitors | 4 d |
| Groups / Reports | Groups: disable the parent select on edit until BT-11, permission gate, classic table, monitors column; Reports: bootstrap-table toolbar, pagination, chart on `/filters/preview` instead of the newest-500 replay, description after BT-12 | 2 d |
| Login / auth | Redirect back to the requested URL after login; session-expired message; `LoginResponse` "Code" branch; remember-me per `ZM_OPT_USE_REMEMBER_ME`; user menu with self-edit (`USER_SELF_EDIT`) + logout calling `GET /auth/logout`; version from `package.json` | 1.5 d |
| Frames / Stats pages | `?view=frames` table (metadata from `/frames?event_id=`; images after BT-09); `?view=stats` per-frame zone stats from `/stats` (client-filtered until it grows params) | 2 d |

Deliberately out of scope: bandwidth profiles (the stub "High" chip is gone from the classic stat bar), **X10 devices (dropped 2026-08-21)**, donate modal, 1.39-only Roles / Menu / Encoder Templates (backend has none of them).

## 7. Backend tickets for zm-api

- ~~**#65 — login request fields renamed**~~ **(filed and withdrawn 2026-08-23; my error, not the API's).** I probed `/auth/login` by hand with `user`/`pass`, got a 422 naming `username`, and called it a breaking change without checking what this client sends. `LoginRequest` has always sent `username`/`password`, and both dev boxes accept it. Recorded here because the plan cites zm-api issues as evidence, and a withdrawn one should not quietly disappear.
- **#70 — the rate limiter allows about one request per four seconds, so no page can load** (filed 2026-08-23). Measured on the reference box: after 150 s of quiet the *second* request 429s, and authenticated requests fare no better — the call straight after a successful login is rejected. A single classic events page needs 11 requests, so it renders an error instead of content. Our side is done: per-setting config reads collapsed into one `/configs` call (13 → 11 per load) and correct `Retry-After` handling. No request queue or artificial pacing was added — that would be a workaround for a backend setting and would slow every page for everyone. **This blocks browser verification against the reference box**, including the remaining classic-fidelity comparisons.
- **#32 — duplicate `operationId`s** (reproduction added 2026-08-23). Six ids are declared twice with different shapes (`list_models`, `create_model`, `get_model`, `delete_model`, `update_model`, `update_state`), which makes generated `paths`/`operations` uncompilable for any codegen client. `scripts/generate-api-types.mjs` strips those blocks and keeps `components`.
- **#62 — `GET /me` changed shape (`UserResponse` → `MeResponse`) with no changelog entry** (filed 2026-08-22). Reading the wrapper as a user left every permission column absent, which fails closed to `None`: the camera wall and every edit control vanished. Fixed our side in `8ed9c69`; the ask upstream is the changelog entry and a CI guard that fails when an existing `responses.200` `$ref` changes.
- **#58 — docs and config still say `zm-dash`/`zm-dashboard`** (filed 2026-08-22). Five references, two of them in `settings/base.toml`'s CORS comments where an operator reads them while debugging. Comments only; nothing breaks. The issue also carries the Option D spec, since `docs/architecture.md`'s nginx example is the thing that changes if `zm-api` starts serving `dist/`.
- **#52 — `POST /reports` 500s on a name longer than 30 characters** (filed 2026-08-22). `Reports.Name` is `varchar(30)`; the truncation surfaces as `DATABASE_ERROR` instead of a 400 naming the field. Both skins cap the input at 30 as a workaround; the same class of bug likely affects every fixed-width ZoneMinder column the API writes.
Filed 2026-08-21 as issues #16–#39 on `SteveGilvarry/zm-api`. **The dev box was updated 2026-08-22 (766c1a7..1a13ff0) and most of them shipped.** Verified live and closed:

| # | Was | Now |
|---|---|---|
| [16](https://github.com/SteveGilvarry/zm-api/issues/16) | event `DATETIME`s stamped `Z` but server-local | true UTC — verified against the wall clock |
| [17](https://github.com/SteveGilvarry/zm-api/issues/17) | unknown routes → 500 text/plain | 404 `{"kind":"NOT_FOUND_ERROR",…}` |
| [18](https://github.com/SteveGilvarry/zm-api/issues/18) | monitor GETs echoed raw DB enums | canonical `Rotate90`/`System`/`Auto`/`WebRtc`, `deleted` a JSON boolean; camera secrets are write-only |
| [20](https://github.com/SteveGilvarry/zm-api/issues/20) | no `cause`/`notes`/`name`/`tag` filters | all four, plus `EventSortField` widened to name/cause/monitor_id/notes/frames |
| [21](https://github.com/SteveGilvarry/zm-api/issues/21) | `level` was an inverted numeric bound | named `min_level` (`fatal…debug`), `search`, `start`, `end`, `sort`, and `DELETE /logs` |
| [24](https://github.com/SteveGilvarry/zm-api/issues/24) | `StorageResponse` was 5 fields | `scheme`, `server_id`, `url`, `disk_space`, `do_delete` |
| [28](https://github.com/SteveGilvarry/zm-api/issues/28) | `parent_id` ignored on update | persists — verified |
| [33](https://github.com/SteveGilvarry/zm-api/issues/33) | no server timezone | `GET /system/locale` → zone, offset and the three format patterns |

Also new and now in use: `GET /me`, `PUT /me/password`, `POST /discovery/onboard`. **Breaking:** `POST /states/change/{action}` was replaced by `POST /server/control/{action}` — the dashboard follows it as of commit `50e7dc3`.

Still open, with what each one blocks:

| # | Ticket | Blocks | Pri |
|---|---|---|---|
| [19](https://github.com/SteveGilvarry/zm-api/issues/19) | create validation vs ZoneMinder's own defaults | a dashboard-created monitor matching a legacy-created one | P1 |
| [22](https://github.com/SteveGilvarry/zm-api/issues/22) | zone motion settings are read-only (write side) | the zone editor's threshold panel; changing a zone's type | P1 |
| [23](https://github.com/SteveGilvarry/zm-api/issues/23) | user permissions/name/phone not writable | admin permission editing and password resets (self-service password now works) | P1 |
| [25](https://github.com/SteveGilvarry/zm-api/issues/25) | server write schema still 4 fields | the legacy Servers modal | P2 |
| [26](https://github.com/SteveGilvarry/zm-api/issues/26) | per-frame image endpoint | frame stepping, the Frames view's thumbnails | P1 |
| [27](https://github.com/SteveGilvarry/zm-api/issues/27) | real API-token resource + logout revocation | an honest API-tokens page; true logout | P2 |
| [29](https://github.com/SteveGilvarry/zm-api/issues/29) | report `description`, partial update | Reports parity | P2 |
| [30](https://github.com/SteveGilvarry/zm-api/issues/30) | bulk event export | Events/Event "Export" | P2 |
| [31](https://github.com/SteveGilvarry/zm-api/issues/31) | filter execute; preview relative dates + `monitor_name` | Filters "Execute now"; preview for legacy filters | P2 |
| [32](https://github.com/SteveGilvarry/zm-api/issues/32) | spec hygiene | contract tests, generated types | P2 |
| [34](https://github.com/SteveGilvarry/zm-api/issues/34) | media-scoped tokens | removing the session JWT from `<img>`/download URLs | P2 |
| [35](https://github.com/SteveGilvarry/zm-api/issues/35) | no-auth mode; `LoginResponse` Code branch | `ZM_OPT_USE_AUTH=0` installs | P2 |
| [36](https://github.com/SteveGilvarry/zm-api/issues/36) | audit rollup / hourly histogram | MissingFiles + ZeroSize; console sparklines without 1000-event pulls | P3 |
| [37](https://github.com/SteveGilvarry/zm-api/issues/37) | remaining legacy controls | alarm enable/disable, PTZ iris/power, stream rate/quality, host shutdown | P3 |
| [39](https://github.com/SteveGilvarry/zm-api/issues/39) | `save_jpe_gs` rejects 2 and 3 | the Recording tab's bitmask select | P2 |

## 8. Test strategy

### Where it stands (measured 2026-08-23)

| | at review | now |
|---|---|---|
| unit tests / files | 725 / 83 | **3,506 / 277** |
| statements / branches | 54.2% / 49.2% | **95.3% / 88.4%** |
| functions / lines | 50.8% / 55.0% | **95.6% / 96.8%** |
| files at 0% | 27 | **0** |
| routes with a test | 14 of 24 | **every page key, both skins** |
| e2e | 18, live box only | **482 seeded (chromium + mobile + webkit), 28 live** |
| CI | none | typecheck, lint, unit + coverage + per-file floor, i18n check, build, audit, container smoke, seeded e2e |

Thresholds are the release bar (85/75/85/85 aggregate) plus a per-file floor
enforced by `npm run coverage:floor` — `thresholds.perFile` applies the
*global* numbers to every file and a glob group is evaluated as an aggregate
with its own `perFile` ignored, so the config could not express it. The
script was verified to fail on a file that is genuinely under.

### What the tiers delivered

- **Tier 0–1** — CI; coverage measured over all of `src/**`; 24 fixture
  factories validated against the tracked OpenAPI snapshot
  (`src/test/openapi/openapi.json`) by `fixtures.schema.test.ts`, so a
  backend change breaks the fixtures instead of leaking into runtime; shared
  MSW handlers with an in-memory store so CRUD round-trips.
- **Tier 2** — `renderRoute()` builds the real TanStack router from
  `routeTree.gen`, so route files, `SkinPage`, skin chrome, `beforeLoad`
  guards and search params execute under test. `src/routes` went 0% → 100%.
- **Tier 3** — streaming: scripted WebSocket delivering real signalling
  messages (offer → answer → ICE → connected, ICE failure → reconnect,
  accept-then-close → bounded backoff, keepalive without pong), and the HLS
  paths including token rotation.
- **Tier 4** — seeded stack: zm-api's own MariaDB recipe on :3308 plus
  `e2e/seed/seed.sql`. The suite no longer needs, or mutates, the dev box.
- **Tier 5** — a spec per route in both skins, plus failure paths (500,
  expired refresh, 403, stream failure). `route-coverage.spec.ts` reads
  `src/skins/pageKeys.ts` and fails on any untagged page key.
- **Tier 6** — deferred: classic visual regression. The a11y baseline plays
  the same ratcheting role for now.
- **Tier 7** — axe on 23 routes × 2 skins, ratcheted against
  `e2e/a11y-baseline.json` (31 known violations, mostly colour-contrast in
  the classic palette); a 390 px mobile project asserting no horizontal
  overflow and a working drawer.

### What the tests caught that review did not

Every one of these was found by a test running against real code or a real
backend, and each is fixed: report creation rejected by zm-api over
millisecond precision; classic Logs, classic Reports, classic Report detail
and classic Options all reading a dead backend as "no rows"; dead sparkline
tooltips (React 19 hoists a bare `<title>` into `<head>`); the classic
pager's GO button blocked by native validation; no field in the monitor
editor having an accessible name; the coverage floor that enforced nothing.

## 9. Roadmap

| Phase | Contents | Effort | Exit criterion | Status (2026-08-23) |
|---|---|---|---|---|
| **0 — Stop the bleeding** | F-1…F-8 (+ dev-box zone repair), Test Tier 0, README/CLAUDE.md truth, `npm audit fix`, devtools → dev deps, drop `motion`, delete stray `events-cleared.yaml` | 7–9 d | CI green on every PR; no known data-destroying path; deployable from a container | **Done.** All three criteria met; `main` gates on five required checks. |
| **1 — Contract & platform** | W1, W2, W3, W4, W5, W6; F-9…F-24; Test Tiers 1–3 | 18–22 d | Every wrapper contract-tested; backend-down and 403 are visible; permissions gate routes/nav/edits; bundle split; streams survive ICE drops | **Mostly done.** W2/W3/W4 complete; contract test (175 cases) against a tracked OpenAPI snapshot; F-9…F-22, F-24, F-25 closed. **Open:** F-23 ◐. W1 closed 2026-08-23 (see below). W5 closed 2026-08-23: `manualChunks` splits react/tanstack/i18n out of the entry (540 kB → 177 kB raw), and `npm run bundle:budget` gates the initial download in CI at 200 kB gz JS / 18 kB gz CSS against 170.3 / 14.4 today — verified to fail when breached, unlike the coverage floor it replaces the lesson of. |
| **2 — Design system & classic foundation** | Section 5 tokens + primitives + classic primitives + Material icons + mobile drawer + dialog a11y; classic `OptionsLayout`; W7 formatter + `ZM_WEB_*` consumption; W8 URL shims + shortcuts | 14–17 d | Light + dark themes; no inline button/input recipes; classic nav reaches every admin page; legacy bookmarks resolve | **Mostly done.** All four criteria met; the modern IA rebuild (waves 7–8) went past the original scope. **Closed 2026-08-23.** Six rows were genuinely unread and five are now consumed: `ZM_OPT_CONTROL` gates PTZ at `usePtzCapabilities`, so one switch hides every control surface in both skins and no capability request is made; `ZM_WEB_SHOW_SERVER_STATS` drops host telemetry from the console line; `ZM_WEB_CONSOLE_BANNER` renders above the wall when set; `ZM_WEB_HOMEVIEW` chooses the landing page after login (an explicit `?redirect=` still wins, and an unknown view falls back to the console rather than stranding the operator); `ZM_CHECK_FOR_UPDATES` + `ZM_DYN_LAST_VERSION` show an update notice, comparing versions numerically because `1.10` sorts below `1.9` as a string — no network call of ours, so air-gapped installs stay silent. **`ZM_FEATURES_SNAPSHOTS` is deliberately not wired**: it gates ZoneMinder's Snapshots feature, which this UI does not implement, and the JPEG stills it might look like it should gate are a different thing. Wiring it to those would be wrong, so the row stays open against the feature, not the config. |
| **3 — Parity build-out** | W9 by area in the listed order; classic rebuild of the six core pages; Test Tiers 4–7 running alongside | 75–85 d | Every FE-possible row in Section 6/W9 closed; classic fidelity ≥ 85 on the six core pages; every route has both-skin e2e | **Feature work essentially complete.** Classic owns all 23 pages on legacy layouts (wave 4), Tiers 4–7 are running, and the 2026-08-23 re-verification drove **every** W9 area in a browser: all are substantially built. The two real gaps it found (Watch monitor navigation, two timestamps bypassing the W7 formatter) are fixed. What is left before 1.0 is Section 10, not W9. **Still unmeasured: classic fidelity** — the ≥ 85 criterion needs fresh captures of the legacy UI, and the dev box that hosts it is down. |
| **4 — Release** | Versioning + CHANGELOG + release workflow; browser matrix; docs; tag **v1.0.0** | 3–4 d | Section 10 checklist all green | **Machinery done 2026-08-23**, version set to `0.9.0`: `CHANGELOG.md`, `.github/workflows/release.yml` (tag-triggered, refuses to publish if the tag disagrees with `package.json`, the CHANGELOG has no section, or the commit has no green CI run; publishes a multi-arch GHCR image and a release from the CHANGELOG section), `.github/dependabot.yml`, and a browser matrix in the README. Remaining: tag v0.9.0, then the 1.0 criteria in Section 10. |
| **5 — Backend-dependent (1.1+)** | Items gated on the open zm-api tickets in Section 7 as they ship; translation coverage | per ticket | — | Ongoing — 8 of 24 tickets landed and are consumed. |

Milestones: **v0.9 beta** at the end of Phase 2 (correct, deployable, secure, both skins usable, parity still partial); **v1.0** at the end of Phase 4; **v1.1** as backend tickets land.

## 10. Release criteria for 1.0


**Merge gating (2026-08-22).** `main` requires `typecheck · unit tests ·
build`, `lint`, `e2e (seeded)`, `container image` and `cla`; force pushes and
branch deletion are blocked and conversations must be resolved. This was not
possible while the repo was private on the Free plan — branch protection *and*
rulesets both 403'd with "Upgrade to GitHub Pro or make this repository
public", the same wall as the CLA required check (`0bdcad4`) — and the gap
cost two bad merges the same morning: PR #1 landed with a red e2e, PR #2 with
two jobs still running, because `gh pr merge --auto` merges on the spot when
no check is required. The repo went public and the checks are now enforced
server-side. Admin override is deliberately left enabled (`enforce_admins:
false`) so a genuine emergency is not blocked by a broken runner; using it
should be rare enough to be memorable.
- Zero P0/P1 open in the gap register for FE-possible items; every BE-blocked item has a ticket number and a visible, honest UI state (disabled with reason), never a silent drop.
- Every legacy `?view=` page has a dashboard home or a documented, deliberate omission (bandwidth, donate, 1.39-only tabs).
- Every `src/api` wrapper passes the OpenAPI contract test; every MSW fixture validates against the schema.
- Coverage ≥ 85/75/85/85 with `perFile` enforced; every route has a both-skin route test and a both-skin e2e happy path plus a failure path; axe clean on every route; 390 px project passes.
- Classic fidelity ≥ 85 on Console, Events, Event view, Watch, Montage/Cycle/Review, Options (reviewed against fresh captures of the dev box).
- Lint, `tsc -b`, build, `npm audit --omit=dev` clean in CI; bundle budget enforced; no credential or IP literal in tracked files.
- Dockerfile + nginx/Caddy samples + runtime API config + TLS/WS proxy docs; a "serve `dist/` behind nginx" smoke test in CI.
- Permission model gates routes, nav and edit affordances for all eight levels; logout revokes what the backend allows; secrets never render.
- ✅ Times correct against a fixed server offset, honouring ZM date-format config. **Done 2026-08-23** — differently from how this row was written: the suite was checked at UTC+14 and UTC−11 and is already zone-independent, so pinning it to one `TZ` would have hidden future drift rather than caught it. Instead `npm run test:tz` runs the whole suite at `Pacific/Kiritimati` (+14, the furthest a date can be pushed into tomorrow) as its own CI job, keeping the property true. It is not yet in the required-check list on `main` — that is a repo-settings change to make deliberately.

## 11. Decisions (taken 2026-08-21)

1. **Skins become proper skins** — foundation implemented, routes migrated (Section 5). Classic rebuild of the six core pages follows in Phase 3.
2. **X10 devices: dropped.** Removed from scope and from W9.
3. **i18n string extraction in 1.0**, RTL via logical CSS + `dir`, vertical writing modes a stated non-goal (W7, `docs/I18N.md`).
4. **Sessions page removed** — the REST API is sessionless.
5. **Dev-box zones repaired** (all four monitors); code fix lands with the migration.
6. **Seeded e2e reuses zm-api's docker test DB** (Test Tier 4); nightly live tests stay on a real box.
7. **Console thumbnails stay live by default**, gated on viewport visibility with a concurrency cap (PERF-2 becomes "gate, don't default off").

## 12. Done log

### 2026-08-21 — review, decisions, P0

Review pass:
- `.env` repointed at the dev box; `@vitest/coverage-v8` added and `vitest.config.ts` now measures all of `src/**` with thresholds.
- Detailed reports + OpenAPI snapshot under `legacy-requirements/review-2026-08-21/`; `PUNCH-LIST.md` marked superseded; six mis-captured legacy screenshots identified for retaking.

Decisions pass (same day, after Section 11 was settled):
- **Skins are packages.** `src/skins/{types,registry,SkinPage,discoverPages,pageKeys}.ts`, `src/skins/README.md`; 22 page keys; every route is a `<SkinPage>` lookup (`src/routes/**` went from ≈4,000 lines to 281); 30 feature hooks extracted; 22 modern pages + 7 classic pages; `registry.test.ts` allow-lists the 15 pages classic still borrows. Zero `skin ===` branches remain in pages, features or routes. Pages are lazy: the build went from one 1.27 MB chunk to 126 chunks (hls.js is its own 512 kB lazy chunk).
- **i18n.** i18next with English-text keys; 1,518 `t()` sites, 1,021 catalogue keys, 38 plural pairs filled by `scripts/i18n-plurals.mjs`; `npm run i18n:extract` / `i18n:check` (wired into CI); 23 language catalogues seeded from ZoneMinder's `web/lang` (2–4% exact-match coverage each — a start for translators); language picker in Appearance; per-page `document.title`. Direction: `<html dir lang>` follows the language (verified in-browser for Hebrew), 48 files rewritten to logical CSS by `scripts/codemod-logical-css.mjs`, directional icons flip, physical media is `dir="ltr"`. `docs/I18N.md` is the guide.
- **Removed:** Sessions page + wrapper + nav entry; X10 from scope; `motion` dependency; devtools moved to devDependencies; `npm audit` 0 (was 1 critical / 5 high); stray `events-cleared.yaml`.
- **Fixed:** all four dev-box zones repaired via the API and the units-toggle corruption removed from `ZoneEditor` (coords stay in pixels; rotated cameras use view dimensions); logout now calls `GET /auth/logout`; `Modal` is a real dialog (role, label, focus trap, restore, no per-keystroke refocus); classic nav uses monochrome icons and shows Swap (fake bandwidth chip gone); `ZM_AUTH_HASH_SECRET` and other `private` configs are masked; empty clone/delete buttons in the monitors list render their icons.
- **Quality gates:** `.github/workflows/ci.yml` (typecheck, tests + coverage thresholds, i18n check, build, audit; lint job now green and can be made blocking); lint 34 errors/24 warnings → **0/0** with root-cause fixes; unit tests 725 → **794** (100 files); real coverage 54% → **66% statements / 59% branches**; live e2e smoke 18/18 after the migration.
- **Seeded e2e:** `e2e/seed/` (MariaDB from zm-api's recipe on :3308, `seed.sql`, `up/reset/down/api.sh`, `global-setup.ts`), `E2E_MODE=seeded` in `playwright.config.ts`, committed fallback password removed, `npm run e2e:seed:*` / `test:e2e:seeded`; verified 15/18 against a real zm-api (two known gaps: header daemon stats, one flaky montage check). Finding for zm-api: its env loader only honours `APP__DB__HOST` (double underscore), not the documented `APP_DB__HOST`.

P0 pass (same evening): F-1, F-2, F-4, F-5, F-7, F-8 closed (see ✅ in Section 4); 24 backend tickets filed on `SteveGilvarry/zm-api` (#16–#39) and linked from Section 7; `src/api/contract.test.ts` (175 cases) keeps wrappers, editor enums and create defaults aligned with the OpenAPI snapshot; `.gitignore` no longer swallows `src/features/logs`. Tests 1,002 / 103 files; lint 0/0; build 129 chunks.

Wave 3 (same night, after zm-api#17/#19/#28/#38 were fixed on the backend branch): W2 permission model + route guards, W3 reliability primitives, W8 legacy URL shims, hotkeys; events/logs P1s; streaming robustness + runtime status + montage/review fixes; admin P1s and a classic Options layout (borrowed classic pages down to 8: login, monitors.zones, montagereview, events.detail, filters, logs, reports.list, reports.detail). Tests 1,259 / 131 files; lint 0/0. Adoption left for pages: `<QueryState>`, `toast.apiError` on mutations, `RequirePerm` around edit controls, the new search params produced by legacy URLs (`/montagereview?monitor_id&min_time&max_time`, `/cycle?monitor_id`, `/montage?group`, `/monitors/$id?edit=true`, `/filters?id=`).

Wave 4 (2026-08-22, early): classic skin owns all 23 pages (borrowed list empty) on shared classic primitives — Console/Watch/Cycle/Montage/Review/Zones/Events/Event view/Frames/Filters/Logs/Reports/Options/admin/Groups/Login rebuilt to legacy layouts; monitor editor at legacy field depth for every source type with validation and 422 mapping; ONVIF discovery dialog + monitor presets; Audit rewritten to the legacy gap semantic; Frames view; PTZ control-profile editor; users list/matrix polish; modern mobile drawer; QueryState/toasts/RequirePerm adopted across pages; legacy URL params consumed; `/login?reason=expired`. Tests 1,455 / 158 files; lint 0/0; build 190 chunks. Still open from W9: Montage Review Fit/archived filter, modern cycle sidebar on Watch, classic montage gridstack resize (reorder only), Event export (needs zm-api#30), MissingFiles/ZeroSize (zm-api#36), frame thumbnails (zm-api#26), Clear Logs (zm-api#21).

Wave 5–6 (2026-08-22): semantic light+dark token layer with a stylesheet-parsing contrast test, shared primitives, and the test build-out in Section 8 (725 → 3,373 tests, real coverage 54% → 95%, seeded e2e, CI).

Wave 7 (2026-08-22): the modern skin's information architecture — fixed frame, one line of chrome, console as a wall, events as a table (Section 5).

### 2026-08-22 — wave 8

- **Modern design pass finished** across all 23 pages; skin renamed Mission Control → **Modern**; portrait cameras fit their frame; pinch-zoom on event playback and the live stage; rotated playback upright; screenshots reproducible from a script (Section 5).
- **Project renamed `zm-dashboard` → `zm-web`** — package, docs, container, Caddy/nginx examples, GitHub repo. `docs/DEPLOYMENT.md` now separates what exists (container + reverse proxy) from the one-binary target (zm-api serves `dist/`), filed upstream as zm-api#58.
- **Repo went public and `main` is gated** on five required checks with auto-merge (Section 10). Branch protection was impossible while private on the Free plan, and the gap had already cost two bad merges that morning.
- **CI made honest.** Seeded e2e now builds `zm_api` as its own step, waits like a real runner, installs webkit for the mobile project, and previews a production build instead of a cold dev server. Four separate causes were fixed in sequence, one of them a genuine MSW/Node 22 defect (`Blob` responses) that I twice misread as runner flake.
- **zm-api#62** — `GET /me` changed shape with no changelog entry, which read as "no permissions" and emptied the UI. Fixed our side; the ask upstream is a spec-diff CI guard.
- **i18n** — see W7. Catalogue sync, the 12% ceiling documented, CLDR plural categories per language, translation-platform compatibility recorded.
- **P0/P1 closed this pass:** F-3, F-6, F-9, F-20, F-25. The register is now clear except **F-23 ◐** (refresh token in `localStorage`, pending zm-api#34).
