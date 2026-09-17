/**
 * ZoneMinder's configured landing page (`ZM_WEB_HOMEVIEW`).
 *
 * Legacy stores a view name — the `view=` value it would navigate to — and
 * sends the operator there after login instead of to the console. The names
 * are ZoneMinder's, so the mapping lives next to the other legacy-URL
 * translation (`src/features/nav/legacyUrl.ts`).
 *
 * Anything unrecognised, empty, or pointing at a view this UI does not have
 * falls back to the console. A misconfigured row must not strand an operator
 * on a blank page at login.
 */
const VIEW_ROUTES: Record<string, string> = {
  console: '/',
  watch: '/monitors',
  montage: '/montage',
  montagereview: '/montagereview',
  cycle: '/cycle',
  events: '/events',
  groups: '/groups',
  log: '/logs',
  logs: '/logs',
  filter: '/filters',
  options: '/settings',
  monitors: '/monitors',
  reports: '/reports',
};

export function homeViewRoute(configured: string | undefined | null): string {
  if (!configured) return '/';
  const key = configured.trim().toLowerCase();
  if (key === '') return '/';
  return VIEW_ROUTES[key] ?? '/';
}
