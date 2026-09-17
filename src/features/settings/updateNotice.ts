/**
 * "A newer ZoneMinder is available" — the legacy `ZM_CHECK_FOR_UPDATES` notice.
 *
 * ZoneMinder's own updater writes the newest release it has seen into
 * `ZM_DYN_LAST_VERSION` (and the check time into `ZM_DYN_LAST_CHECK`); the
 * web UI only compares and displays. This does the same: no network call of
 * our own, so an air-gapped install stays silent rather than reaching out.
 */

/**
 * Compare two dotted version strings numerically.
 *
 * `localeCompare` is wrong here — it orders "1.10" before "1.9" — and so is
 * a plain float parse, which cannot see the third component. Non-numeric
 * suffixes ("1.39.16-1ubuntu") compare by their leading number, which is
 * what a packaged build needs.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.trim().split('.').map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface UpdateNotice {
  current: string;
  latest: string;
}

/**
 * The notice to show, or null. Null whenever anything is missing or the
 * install is current — a version we cannot parse must not become a nag.
 */
export function updateNotice(opts: {
  enabled: boolean;
  current: string | undefined;
  latest: string | undefined;
}): UpdateNotice | null {
  const { enabled, current, latest } = opts;
  if (!enabled) return null;
  if (!current?.trim() || !latest?.trim()) return null;
  if (compareVersions(latest, current) <= 0) return null;
  return { current: current.trim(), latest: latest.trim() };
}
