# Deploying zm-web

`npm run build` produces a static site in `dist/`. Serving it in production needs
four things, and every option below provides all four:

1. A static file server with an SPA fallback, so a deep link such as
   `/events/123` returns `index.html` and the router takes over.
2. A reverse proxy from `/api/` to [`zm-api`](https://github.com/SteveGilvarry/zm-api),
   with WebSocket upgrade. WebRTC signaling runs over
   `/api/v3/live/{id}/webrtc/ws`, and those sockets stay open for as long as the
   operator watches, so proxy read timeouts must be long (the samples use 1 h).
3. No caching of `index.html` and `config.js`; long caching of `/assets/*`,
   whose filenames carry a content hash.
4. TLS. Browsers refuse WebRTC on plain `http://` except for `localhost`, and
   the JWT travels in the `Authorization` header (or `?token=` for media and
   WebSockets), which you do not want on the wire in clear.

**Which one to pick.** Option D is where this is going and what a fresh install
should end up with: `zm-api` serves `dist/` itself, so the whole UI is one
binary plus one directory — no PHP, no Apache, no nginx. It needs a change in
`zm-api` that has not landed yet. Until it does, Option A (the container) is
the supported path, and B/C exist for people who already run a web server.

## Option A: the container

The image builds the app with Node 22 and serves it from `nginx:1.27-alpine`.
The entrypoint renders the nginx config and `/config.js` from environment
variables on every start, so one image serves every install.

```bash
docker build -t zm-web .
docker run -d --name zm-web -p 8080:8080 \
  -e ZM_API_URL=http://192.168.0.45:8080 \
  zm-web
```

Or with the example `docker-compose.yml` (edit `ZM_API_URL` or export it):

```bash
ZM_API_URL=http://192.168.0.45:8080 docker compose up -d
# add HTTPS on :8443 via the bundled Caddy:
ZM_PUBLIC_HOST=zm.example.net docker compose --profile tls up -d
```

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `ZM_API_URL` | required | Upstream `zm-api` the container proxies `/api/` to, e.g. `http://zm-api:8080`. Trailing slashes are stripped. |
| `ZM_API_BASE` | `/api/v3` | Prefix the **browser** calls. Leave unset to use the same-origin proxy. Set it to an absolute URL only if the browser should talk to `zm-api` on another origin; `zm-api` must then answer CORS preflights, and the entrypoint adds that origin to the CSP. |
| `ZM_LISTEN_PORT` | `8080` | nginx listen port inside the container. Unprivileged, so the image also runs rootless. |
| `ZM_CSP_API_SRC` | derived | Override the source list used for `connect-src`, `img-src` and `media-src` in the Content-Security-Policy. |

Build arguments (rarely needed): `VITE_BASE` (sub-path, see below) and
`VITE_API_BASE` (bakes an API prefix into the bundle; `ZM_API_BASE` still wins
at runtime).

The container listens on plain HTTP. Terminate TLS in front of it with whatever
you already run (the compose `tls` profile, Traefik, an existing nginx), and
make sure that layer also forwards WebSocket upgrades.

### What the nginx config does

`docker/nginx.conf.template` plus `docker/proxy.conf` and `docker/headers.conf`:

- `location /api/` proxies to `ZM_API_URL` with `Upgrade`/`Connection` headers
  and 1 h send/read timeouts.
- `location ^~ /api/v3/live/` is the same plus `proxy_buffering off`, so HLS
  segments and signaling frames are forwarded as `zm-api` writes them.
- `/assets/` gets `Cache-Control: public, max-age=31536000, immutable`;
  `/fonts/` one week; `index.html` `no-cache`; `config.js` `no-store`.
- gzip for text, JS, JSON, SVG and HLS playlists.
- Security headers on every response: `X-Content-Type-Options`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, a
  `Permissions-Policy` that disables camera/microphone/geolocation, and the CSP
  below.

The CSP:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self';
connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'self';
base-uri 'self'; form-action 'self'; object-src 'none'
```

`style-src` carries `'unsafe-inline'` because React writes inline `style`
attributes for dynamic layout (montage grid sizes, zone polygons, progress
bars). Scripts need no such exception; Vite emits no inline script. `blob:` in
`media-src` is the MediaSource URL hls.js attaches to the `<video>`; `blob:` in
`worker-src` is its demuxer worker. WebRTC's STUN/TURN traffic is not governed
by `connect-src` (browsers use the separate `webrtc` directive, default allow),
so the Google STUN servers need no entry.

## Option B: bare nginx

Build on any machine with Node 20+ and copy `dist/` to the server:

```bash
npm ci && npm run build
rsync -a dist/ server:/var/www/zm-web/
```

Then take `docker/nginx.conf.template`, `docker/proxy.conf` and
`docker/headers.conf`, replace `${ZM_API_URL}`, `${ZM_LISTEN_PORT}` and
`${ZM_CSP_API_SRC}` (normally `'self'`) by hand, fix `root` and the include
paths, and add your `ssl_certificate` lines. The `map $http_upgrade` block must
sit at `http` level, which is where `conf.d/*.conf` is included by default.

## Option C: Caddy

`docker/Caddyfile` is the same setup in Caddy form. Caddy obtains and renews the
certificate for a public hostname by itself and proxies WebSockets without
extra configuration:

```bash
ZM_SITE_ADDRESS=zm.example.net ZM_API_URL=http://192.168.0.45:8080 \
ZM_WEB_ROOT=/var/www/zm-web caddy run --config docker/Caddyfile
```

For a LAN-only name add `tls internal` inside the site block.

## Option D (target): served by `zm-api`

The four requirements above are not four programs. `zm-api` already terminates
TLS (`rustls`, with ACME/Let's Encrypt built in — `[server.tls]` and
`[server.acme]` in its `settings/base.toml`), already compresses responses, and
already ships a systemd unit and a Debian package. The only thing it does not
do is hand back the files in `dist/`. Once it does:

```
                       ┌──────────────────────────────┐
   browser  ──TLS──▶   │ zm-api                       │
                       │  /api/v3/**  REST, HLS, WS   │
                       │  /**         dist/  (SPA)    │
                       └──────────────┬───────────────┘
                                      │ MariaDB, /dev/shm, events on disk
                                      ▼
                              ZoneMinder capture daemons
```

No reverse proxy, because there is nothing to proxy to — the API and the app
are the same origin by construction, which also retires the CORS configuration
and the `ZM_API_BASE` cross-origin case.

**What `zm-api` needs to add** (all of it inside `src/routes/mod.rs`;
`tower-http`'s `fs` and `set-header` features are already enabled):

1. A `ServeDir` rooted at a configured `web_root` (default `/usr/share/zm_web`),
   with `not_found_service` pointing at `dist/index.html` — that is the SPA
   fallback.
2. Route order: the API router first, the static service as the fallback. A
   request for `/events/29246` must reach `index.html`, and one for
   `/api/v3/events/29246` must not.
3. Cache-control, matching what `docker/nginx.conf.template` sets today:
   `/assets/*` → `public, max-age=31536000, immutable`; `index.html` →
   `no-cache`; `config.js` → `no-store`.
4. The five security headers from `docker/headers.conf`, including the CSP.
   Same policy, moved from nginx into a `SetResponseHeaderLayer`.
5. `config.js` written at start-up (or served from config) the way
   `docker/entrypoint.sh` writes it now — or dropped entirely, since a
   same-origin install has nothing to configure.

**What the install looks like then.** Two packages from one repo pair:

| | |
|---|---|
| `zm_api` | the binary, `packaging/systemd/zm_api.service`, JWT keys generated on first run — all of this exists today (deb/rpm/arch via `scripts/package.sh`) |
| `zm-web` | `dist/` into `/usr/share/zm_web/`, nothing else — does not exist yet |

Install both, point `zm-api` at the ZoneMinder database, done. The web package
is architecture-independent and has no runtime dependencies: it is a directory
of files, read by the `zoneminder` user the unit already runs as.

`zm-api` installs in *passive* mode (REST only, ZoneMinder keeps supervising
its own daemons) and takes over daemon supervision on `zm_api-takeover`. That
suits this plan: the UI can be swapped long before the supervisor is.

**Where it has to run.** On the ZoneMinder host. `zm-api` reads the capture
daemons' shared memory under `/dev/shm` (`src/zm_shm.rs`) and the event files on
disk, so it is not a service you can move to another machine. That is a
property of the API, not of this change, and it is why "one binary on the NVR"
is the right shape.

**Migration.** Nothing here forces Apache off the box. Legacy ZoneMinder keeps
answering on `/zm` while `zm-api` answers on its own port, so an operator can
run both, compare, and switch when they are ready — then remove PHP.

**Not done yet.** `zm-api` has no static route today (no `ServeDir` anywhere in
`src/`), so this option does not exist to install. Everything above is the
spec for making it exist.

## Runtime configuration

`index.html` loads `/config.js` before the app. It sets
`window.__ZM_CONFIG__`; the only key today is `apiBase`. `src/api/base.ts`
resolves the API prefix as

```
window.__ZM_CONFIG__.apiBase  ->  VITE_API_BASE (build time)  ->  /api/v3
```

and derives the WebSocket base (`ws(s)://host/api/v3`) from it. Static hosts
without a container can edit `dist/config.js` after the build; nothing else in
the bundle references the API location.

## Serving under a sub-path

Set `VITE_BASE=/zm/` at build time (`VITE_BASE=/zm/ npm run build`, or
`--build-arg VITE_BASE=/zm/`). Vite prefixes every asset URL, `index.html`
references `/zm/config.js` and `/zm/fonts/...`, and `src/main.tsx` passes
`import.meta.env.BASE_URL` to the router as `basepath`. The API prefix is
independent of the sub-path: the default stays `/api/v3`, so either keep the
proxy at the root or set `ZM_API_BASE=/zm/api/v3` and move the proxy location
to match.

## WebRTC: STUN and TURN

`src/streaming/webrtcManager.ts` offers `stun.l.google.com:19302` and
`stun1.l.google.com:19302` as ICE servers. On a flat LAN, or when the browser
and `zm-api` can reach each other directly, STUN is never consulted and the
stream works without internet access. Across NAT (remote operators, VPN with
hairpinning, double NAT) ICE needs a reachable server: run
[coturn](https://github.com/coturn/coturn) next to `zm-api` and edit the
`STUN_SERVERS` list. A runtime `iceServers` key in `config.js` is planned but
not wired up yet. If WebRTC cannot connect, the Watch page still offers HLS,
which is plain HTTPS through the proxy.

## Air-gapped installs

The bundle makes no requests outside your own origin. Geist and JetBrains Mono
ship in `public/fonts/` (served from `/fonts/`) rather than from jsDelivr, and
the CSP's `font-src 'self'` would block a CDN anyway. The only outbound names
in the code are the two Google STUN hosts above, which are harmless when
unreachable (ICE times out and falls back to host candidates). Build the image
on a machine with registry access and ship it with `docker save`/`docker load`.

## Checking an install

```bash
H=http://localhost:8080
curl -sI $H/                 | grep -i 'cache-control'        # no-cache
curl -so /dev/null -w '%{http_code}\n' $H/events/1             # 200, index.html
curl -s  $H/config.js                                           # window.__ZM_CONFIG__ = ...
curl -sI $H/assets/$(curl -s $H/ | grep -o 'assets/[^"]*\.js' | head -1 | cut -d/ -f2) | grep -i cache   # immutable
curl -s  $H/api/v3/server/health_check                          # proxied to zm-api
```

Then open the Watch page for a monitor with the browser console open. A
Content-Security-Policy violation is logged there if a header needs widening.
