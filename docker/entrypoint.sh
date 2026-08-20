#!/bin/sh
# Container entrypoint: render nginx config + runtime config.js from env, then run nginx.
set -eu

HTML=/usr/share/nginx/html
TEMPLATE=/etc/nginx/zm/nginx.conf.template

: "${ZM_API_URL:?ZM_API_URL is required (upstream zm_api, e.g. http://zm-api:8080)}"
# A trailing slash would make nginx strip the /api/ prefix on the way through.
ZM_API_URL=$(printf '%s' "$ZM_API_URL" | sed -E 's#/+$##')
export ZM_API_URL
export ZM_LISTEN_PORT="${ZM_LISTEN_PORT:-8080}"

# /config.js — read by the app before it boots (see src/api/base.ts).
if [ -n "${ZM_API_BASE:-}" ]; then
  escaped=$(printf '%s' "$ZM_API_BASE" | sed "s/'/\\\\'/g")
  printf "window.__ZM_CONFIG__ = { apiBase: '%s' };\n" "$escaped" > "$HTML/config.js"
else
  printf "window.__ZM_CONFIG__ = {};\n" > "$HTML/config.js"
fi

# CSP: the browser talks to 'self' unless ZM_API_BASE points at another origin,
# in which case that origin (and its ws(s) twin) must be allowed too.
if [ -z "${ZM_CSP_API_SRC:-}" ]; then
  ZM_CSP_API_SRC="'self'"
  case "${ZM_API_BASE:-}" in
    http://*|https://*)
      origin=$(printf '%s' "$ZM_API_BASE" | sed -E 's#^(https?://[^/]+).*#\1#')
      ZM_CSP_API_SRC="'self' $origin $(printf '%s' "$origin" | sed -E 's#^http#ws#')"
      ;;
  esac
fi
export ZM_CSP_API_SRC

# Only substitute our own variables so nginx's $uri/$host/... survive.
envsubst '${ZM_API_URL} ${ZM_LISTEN_PORT} ${ZM_CSP_API_SRC}' < "$TEMPLATE" > /etc/nginx/conf.d/zm-dashboard.conf

echo "zm-dashboard: listening on :${ZM_LISTEN_PORT}, proxying /api/ -> ${ZM_API_URL}, apiBase=${ZM_API_BASE:-/api/v3}"
nginx -t
exec nginx -g 'daemon off;'
