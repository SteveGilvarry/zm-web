# Changelog

All notable changes to zm-web are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org/spec/v2.0.0.html).

zm-web talks only to [zm-api](https://github.com/SteveGilvarry/zm-api). Where
a release depends on a backend change, the zm-api issue is named — features
gated on an unreleased backend are shown disabled with a reason rather than
silently doing nothing.

## [Unreleased]

## [0.9.0] — 2026-08-23

First tagged release: the beta milestone from
`docs/PRODUCTION-READINESS-PLAN.md`. Correct, deployable and secure, with
both skins usable. Not yet 1.0 — see *Known gaps*.

### Added

- **Two real skins on one codebase.** Modern (a content-first ops console)
  and Classic (a reproduction of the ZoneMinder 1.39 layout). A skin is a
  package with its own shell, tokens and one lazy page per route; routes are
  thin lookups and all data lives in shared feature hooks. Classic owns all
  23 pages on legacy layouts.
- **Live viewing** over WebRTC with automatic HLS fallback, including the
  Safari paths, rotated cameras, digital pinch-zoom, a volume control, and
  viewport-gated console thumbnails with a concurrency cap.
- **Montage, Montage Review and Cycle**, with a master clock, per-cell
  playback, event bars, Fit, zoom and pan.
- **Events**: a dense table with server-side sort, a column chooser, bulk
  view / download / edit / archive / delete, CSV export, tags, and a
  per-frame scrubber.
- **Filters** that round-trip ZoneMinder's own `terms` format byte for byte,
  with first-class actions and server-side preview.
- **Administration**: monitor editor at legacy field depth for every source
  type, ONVIF discovery, monitor presets, zones, groups, users, servers,
  storage, PTZ control profiles, logs, the windowed audit report, and the
  ZoneMinder configuration editor.
- **Internationalisation.** Every string extracted (1,739 keys, English text
  as the key), 26 catalogues, RTL via logical CSS with `dir`/`lang` on the
  document, and per-language CLDR plural categories.
- **Permission model** driven by the eight levels in the JWT, gating routes,
  navigation and edit affordances.
- **Deployment**: a multi-stage container serving the build behind nginx with
  `/api` proxying and WebSocket upgrade, a runtime-configurable API base, and
  nginx/Caddy samples. See `docs/DEPLOYMENT.md`.

### Fixed

Every P0 and P1 in the 2026-08-21 gap register except F-23, notably:

- Filter edits never persisted and used a wire format incompatible with
  ZoneMinder's — saving one could have driven `zmfilter.pl` to delete every
  event.
- Add Monitor and Clone both returned 422 against a real backend.
- The zone units toggle rewrote pixel coordinates as percentages and saved
  them, disabling motion detection on affected monitors.
- Storage edits silently failed (PUT to a PATCH-only route).
- `ZM_AUTH_HASH_SECRET` and other private settings rendered in clear.
- Backend-down rendered as "no events found" on 21 of 24 routes.

### Security

- Secrets are masked; camera passwords are write-only.
- `npm audit --omit=dev` is clean and gates CI.
- Referrer policy set; devtools moved out of production dependencies.

### Known gaps

- **F-23**: the refresh token is still in `localStorage`, and media URLs
  carry the session token as a query parameter. Waiting on zm-api#34
  (media-scoped tokens) and zm-api#27 (token revocation).
- **Classic fidelity is unmeasured** against fresh captures of the legacy UI.
- Features gated on open zm-api issues are disabled with a reason: writable
  user permissions (#23), zone motion settings (#22), per-frame images (#26),
  bulk event export (#30), filter execute (#31), audit rollups (#36).

[Unreleased]: https://github.com/SteveGilvarry/zm-web/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/SteveGilvarry/zm-web/releases/tag/v0.9.0
