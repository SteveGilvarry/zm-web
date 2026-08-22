# Deploying zm-web

`npm run build` produces a static site in `dist/`. Serving it in production needs
four things, and every option below provides all four:

1. A static file server with an SPA fallback, so a deep link such as
   `/events/123` returns `index.html` and the router takes over.
2. A reverse proxy from `/api/` to [`zm_api`](https://github.com/SteveGilvarry/zm-api),
   with WebSocket upgrade. WebRTC signaling runs over
   `/api/v3/live/{id}/webrtc/ws`, and those sockets stay open for as long as the
   operator watches, so proxy read timeouts must be long (the samples use 1 h).
3. No caching of `index.html` and `config.js`; long caching of `/assets/*`,
   whose filenames carry a content hash.
4. TLS. Browsers refuse WebRTC on plain `http://` except for `localhost`, and
   the JWT travels in the `Authorization` header (or `?token=` for media and
   WebSockets), which you do not want on the wire in clear.

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
| `ZM_API_URL` | required | Upstream `zm_api` the container proxies `/api/` to, e.g. `http://zm-api:8080`. Trailing slashes are stripped. |
| `ZM_API_BASE` | `/api/v3` | Prefix the **browser** calls. Leave unset to use the same-origin proxy. Set it to an absolute URL only if the browser should talk to `zm_api` on another origin; `zm_api` must then answer CORS preflights, and the entrypoint adds that origin to the CSP. |
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
  segments and signaling frames are forwarded as `zm_api` writes them.
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
ZM_DASHBOARD_ROOT=/var/www/zm-web caddy run --config docker/Caddyfile
```

For a LAN-only name add `tls internal` inside the site block.

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
and `zm_api` can reach each other directly, STUN is never consulted and the
stream works without internet access. Across NAT (remote operators, VPN with
hairpinning, double NAT) ICE needs a reachable server: run
[coturn](https://github.com/coturn/coturn) next to `zm_api` and edit the
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
curl -s  $H/api/v3/server/health_check                          # proxied to zm_api
```

Then open the Watch page for a monitor with the browser console open. A
Content-Security-Policy violation is logged there if a header needs widening.
