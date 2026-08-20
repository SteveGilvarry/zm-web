/**
 * Legacy ZoneMinder URL compatibility.
 *
 * The PHP UI addresses everything as `index.php?view=<name>&…`. Bookmarks,
 * emailed event links (`%EPS%`), and the notification scripts all produce
 * them. `mapLegacyUrl` turns such a URL into a dashboard route so those links
 * keep working; the root route applies it before anything renders.
 *
 * Pure: takes a pathname + search string, returns a target or null when the
 * URL is not a legacy one.
 */

export type SearchValue = string | number | boolean;

export interface LegacyTarget {
  to: string;
  search: Record<string, SearchValue>;
}

/** `?view=options&tab=…` → sub-page. Other tabs land on /settings with `tab`. */
const OPTIONS_TABS: Record<string, string> = {
  users: '/settings/users',
  servers: '/settings/servers',
  storage: '/settings/storage',
  control: '/settings/ptz-controls',
};

const toInt = (v: string | null): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Read legacy `filter[Query][terms][N][attr|op|val]` triples. */
function filterTerms(params: URLSearchParams): Array<{ attr: string; op: string; val: string }> {
  const byIndex = new Map<string, { attr?: string; op?: string; val?: string }>();
  for (const [key, value] of params) {
    const m = /^filter\[Query\]\[terms\]\[(\d+)\]\[(attr|op|val)\]$/.exec(key);
    if (!m) continue;
    const term = byIndex.get(m[1]) ?? {};
    term[m[2] as 'attr' | 'op' | 'val'] = value;
    byIndex.set(m[1], term);
  }
  return [...byIndex.values()]
    .filter((t): t is { attr: string; op: string; val: string } => !!t.attr && !!t.val)
    .map((t) => ({ attr: t.attr, op: t.op ?? '=', val: t.val }));
}

/**
 * Events list: only the terms the dashboard's `/events` search already
 * understands are carried over (MonitorId =, Archived =). Anything else means
 * the link lands on the plain list rather than a wrong subset.
 */
function eventsTarget(params: URLSearchParams): LegacyTarget {
  const search: Record<string, SearchValue> = {};
  for (const term of filterTerms(params)) {
    if (term.op !== '=' && term.op !== '==') continue;
    if (term.attr === 'MonitorId') {
      const id = toInt(term.val);
      if (id != null) search.monitor_id = id;
    } else if (term.attr === 'Archived') {
      search.archived = term.val === '1';
    }
  }
  return { to: '/events', search };
}

export function mapLegacyUrl(pathname: string, searchString: string): LegacyTarget | null {
  const params = new URLSearchParams(searchString.startsWith('?') ? searchString.slice(1) : searchString);
  const view = params.get('view');
  const isIndexPhp = /(^|\/)index\.php$/.test(pathname);
  if (view == null) return isIndexPhp ? { to: '/', search: {} } : null;

  const mid = toInt(params.get('mid'));
  const eid = toInt(params.get('eid'));
  const id = toInt(params.get('id')) ?? toInt(params.get('Id'));

  switch (view) {
    case 'console':
    case 'login':
    case 'postlogin':
      return { to: '/', search: {} };
    case 'logout':
      return { to: '/login', search: {} };
    case 'watch':
      return mid != null ? { to: `/monitors/${mid}`, search: {} } : { to: '/monitors', search: {} };
    case 'monitor':
      // Editor. The watch page hosts it; `edit` asks it to open on load.
      return mid != null
        ? { to: `/monitors/${mid}`, search: { edit: true } }
        : { to: '/monitors', search: { new: true } };
    case 'zones':
    case 'zone':
      return mid != null ? { to: `/monitors/${mid}/zones`, search: {} } : { to: '/monitors', search: {} };
    case 'event':
    case 'frames':
    case 'frame':
      return eid != null ? { to: `/events/${eid}`, search: {} } : { to: '/events', search: {} };
    case 'events':
      return eventsTarget(params);
    case 'montage': {
      const group = toInt(params.get('group'));
      return { to: '/montage', search: group != null ? { group } : {} };
    }
    case 'montagereview':
    case 'timeline': {
      const search: Record<string, SearchValue> = {};
      const monitorId = toInt(params.get('MonitorId') ?? params.get('mid'));
      if (monitorId != null) search.monitor_id = monitorId;
      const min = params.get('minTime');
      const max = params.get('maxTime');
      if (min) search.min_time = min;
      if (max) search.max_time = max;
      return { to: '/montagereview', search };
    }
    case 'cycle':
      return { to: '/cycle', search: mid != null ? { monitor_id: mid } : {} };
    case 'options': {
      const tab = params.get('tab');
      if (tab && OPTIONS_TABS[tab]) return { to: OPTIONS_TABS[tab], search: {} };
      return { to: '/settings', search: tab ? { tab } : {} };
    }
    case 'state':
      return { to: '/settings/state', search: {} };
    case 'user':
    case 'users': {
      const uid = toInt(params.get('uid'));
      return { to: '/settings/users', search: uid != null ? { uid } : {} };
    }
    case 'server':
    case 'servers':
      return { to: '/settings/servers', search: {} };
    case 'storage':
      return { to: '/settings/storage', search: {} };
    case 'controlcaps':
    case 'controlcap':
      return { to: '/settings/ptz-controls', search: {} };
    case 'filter':
      return { to: '/filters', search: id != null ? { id } : {} };
    case 'log':
      return { to: '/logs', search: {} };
    case 'groups':
    case 'group':
      return { to: '/groups', search: {} };
    case 'reports':
      return { to: '/reports', search: {} };
    case 'report':
      return id != null ? { to: `/reports/${id}`, search: {} } : { to: '/reports', search: {} };
    case 'report_event_audit':
      return { to: '/audit', search: {} };
    default:
      // Unknown legacy view: a PHP path still needs a home; an SPA path is
      // left alone so the router can 404 it honestly.
      return isIndexPhp ? { to: '/', search: {} } : null;
  }
}

/** `{to, search}` → `/path?a=1&b=x` (search keys sorted for stable URLs). */
export function targetHref(target: LegacyTarget): string {
  const qs = new URLSearchParams();
  for (const key of Object.keys(target.search).sort()) qs.set(key, String(target.search[key]));
  const s = qs.toString();
  return s ? `${target.to}?${s}` : target.to;
}
