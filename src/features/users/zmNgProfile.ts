/**
 * The zmNinjaNg (zmNg) profile a user scans from the user editor, as legacy
 * `user.php` builds it: a compact JSON the app's QR import understands
 * (`app/src/services/qr-profile.ts` in zmNinjaNg: `n` name, `p` portal URL,
 * `u` username, `pw` password; `a` API URL and `c` CGI URL are optional).
 *
 * `a` is deliberately left out. zmNinjaNg today treats any `a` or `c` as a
 * request for its manual-URL mode, which refuses to save without both, and v3
 * has no CGI URL. With only `p` the app discovers the API itself; a server
 * that still answers Cake on the same origin is found and then probed up to
 * v3. A zm-api-only origin is not: that needs the v2 payload tracked in
 * zm-api (device codes) and a zmNinjaNg import that knows it.
 */

export interface ZmNgProfile {
  name: string;
  portalUrl: string;
  username: string;
}

export const DEFAULT_PROFILE_NAME = 'ZoneMinder';
const DEFAULT_HOME_URL = 'https://zoneminder.com';

/**
 * `user.php`: `ZM_WEB_TITLE` when the operator changed it, else `ZM_HOME_URL`
 * when they changed that, else "ZoneMinder".
 */
export function zmNgProfileName(webTitle: string | null | undefined, homeUrl: string | null | undefined): string {
  const title = (webTitle ?? '').trim();
  if (title && title !== DEFAULT_PROFILE_NAME) return title;
  const home = (homeUrl ?? '').trim();
  if (home && home !== DEFAULT_HOME_URL) return home;
  return DEFAULT_PROFILE_NAME;
}

/**
 * Where this UI is served from, as the app should store it: origin plus the
 * build's base path, no trailing slash. Legacy sends `dirname(SCRIPT_NAME)`,
 * so `/zm` for the PHP UI; here it is `/` or `VITE_BASE`.
 */
export function zmNgPortalUrl(origin: string, basePath: string = import.meta.env.BASE_URL ?? '/'): string {
  const base = basePath.replace(/\/+$/, '');
  return `${origin.replace(/\/+$/, '')}${base}`;
}

/** The QR text. Keys are the app's; never a password. */
export function zmNgQrPayload(profile: ZmNgProfile): string {
  return JSON.stringify({ n: profile.name, p: profile.portalUrl, u: profile.username });
}

/**
 * The QR as an SVG document. The encoder is its own chunk: nothing else in
 * the app needs it, and the user editor loads it only once a profile shows.
 * Error correction M and a one-module quiet zone, as legacy renders it.
 */
export async function renderQrSvg(text: string): Promise<string> {
  const { toString } = await import('qrcode');
  return toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
}
