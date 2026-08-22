/**
 * Where the zm-api backend lives, resolved at runtime rather than build time.
 *
 * Resolution order:
 *   1. `window.__ZM_CONFIG__.apiBase` — written by `/config.js`, which the
 *      container entrypoint regenerates from `ZM_API_BASE` on every start. Lets
 *      one image serve any install.
 *   2. `VITE_API_BASE` — baked in at `npm run build` for static hosts that
 *      cannot run a script at deploy time.
 *   3. `/api/v3` — same-origin, behind a reverse proxy (the default and what
 *      the dev server, the Docker image and the MSW test handlers all assume).
 *
 * A value may be a path (`/zm/api/v3`) or an absolute URL
 * (`https://api.example.net/api/v3`). Trailing slashes are stripped so callers
 * can always write `${API_BASE}/events`.
 */

declare global {
  interface Window {
    __ZM_CONFIG__?: { apiBase?: string };
  }
}

function normalise(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveApiBase(): string {
  const runtime = typeof window !== 'undefined' ? window.__ZM_CONFIG__?.apiBase : undefined;
  return normalise(runtime) ?? normalise(import.meta.env.VITE_API_BASE) ?? '/api/v3';
}

/** Prefix for every REST call, e.g. `/api/v3` or `https://host/api/v3`. */
export const API_BASE: string = resolveApiBase();

/**
 * The WebSocket form of {@link API_BASE}: `ws(s)://host/api/v3`. Browsers
 * cannot open a WebSocket against a relative path, so a path-only base is
 * resolved against the current origin with the matching ws/wss scheme.
 */
export function wsBase(apiBase: string = API_BASE): string {
  if (/^wss?:\/\//i.test(apiBase)) return apiBase;
  if (/^https?:\/\//i.test(apiBase)) return apiBase.replace(/^http/i, 'ws');
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = apiBase.startsWith('/') ? apiBase : `/${apiBase}`;
  return `${scheme}//${window.location.host}${path}`;
}
