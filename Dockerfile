# syntax=docker/dockerfile:1
#
# zm-web — static React build served by nginx, with /api reverse-proxied
# to zm_api (WebSocket upgrade included). See docs/DEPLOYMENT.md.
#
#   docker build -t zm-web .
#   docker run -p 8080:8080 -e ZM_API_URL=http://zm-api-host:8080 zm-web

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Build-time knobs (rarely needed — prefer the runtime env vars below):
#   VITE_BASE      public sub-path the app is served from, e.g. /zm/  (default /)
#   VITE_API_BASE  baked-in API prefix; ZM_API_BASE at runtime overrides it
ARG VITE_BASE=/
ARG VITE_API_BASE=
ENV VITE_BASE=$VITE_BASE VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.source="https://github.com/SteveGilvarry/zm-web" \
      org.opencontainers.image.licenses="AGPL-3.0"
# Runtime env:
#   ZM_API_URL           upstream zm_api for the /api/ proxy (required), e.g. http://zm-api:8080
#   ZM_API_BASE          API prefix the browser should call (default /api/v3, same origin)
#   ZM_LISTEN_PORT       nginx listen port (default 8080)
#   ZM_CSP_API_SRC       override the CSP source list for API/WS/media (default derived)
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf.template docker/proxy.conf docker/headers.conf /etc/nginx/zm/
COPY docker/entrypoint.sh /usr/local/bin/zm-entrypoint.sh
RUN rm -f /etc/nginx/conf.d/default.conf && chmod +x /usr/local/bin/zm-entrypoint.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${ZM_LISTEN_PORT:-8080}/config.js" >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/zm-entrypoint.sh"]
