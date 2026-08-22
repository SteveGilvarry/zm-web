/**
 * Post-login redirect target, carried as `/login?redirect=<path>`.
 *
 * Only same-app paths are honoured: a value must start with a single `/`
 * (so `//evil.example` and `https://…` are out) and must not point back at
 * the login page itself.
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/^\/login(?:[/?#]|$)/.test(value)) return null;
  return value;
}

/** What to put in `?redirect=` for a location the user was bounced from. */
export function redirectParamFor(pathname: string, searchString: string): string | undefined {
  const search = searchString && !searchString.startsWith('?') ? `?${searchString}` : searchString;
  const href = `${pathname}${search ?? ''}`;
  return href === '/' ? undefined : href;
}
