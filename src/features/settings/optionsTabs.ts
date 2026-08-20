import type { TFunction } from 'i18next';

/**
 * Config categories the Options rail never shows: the three bandwidth
 * profiles are out of scope for this dashboard (see MEMORY.md), `hidden`
 * is hidden by definition and `dynamic` holds runtime counters the legacy
 * UI never exposed either.
 */
export const HIDDEN_CONFIG_CATEGORIES: ReadonlySet<string> = new Set([
  'highband',
  'medband',
  'lowband',
  'hidden',
  'dynamic',
]);

/** Pseudo-category the classic rail uses for the skin chooser. */
export const DISPLAY_TAB = 'display';

export interface CategoryCount {
  name: string;
  count: number;
}

/**
 * Categories an operator may browse. `x10` only appears while `ZM_OPT_X10`
 * is on, exactly as legacy `options.php` gates its X10 tab.
 */
export function visibleCategories(
  categories: readonly CategoryCount[],
  x10Enabled: boolean,
): CategoryCount[] {
  return categories.filter(
    (c) =>
      !HIDDEN_CONFIG_CATEGORIES.has(c.name.toLowerCase()) &&
      (x10Enabled || c.name.toLowerCase() !== 'x10'),
  );
}

export type OptionsTab =
  | { kind: 'category'; key: string; category: string }
  | { kind: 'page'; key: string; to: string };

/**
 * Legacy tab order (`web/skins/classic/views/options.php`), bandwidth tabs
 * removed. Category tabs only render when the backend actually has rows in
 * that category — `api`, for instance, is folded into `system` on some
 * builds — and unknown categories are appended before the page tabs so
 * nothing the backend serves becomes unreachable.
 */
const LEGACY_ORDER: ReadonlyArray<
  | { key: string; category: string }
  | { key: string; to: string }
> = [
  { key: DISPLAY_TAB, to: '/settings' },
  { key: 'system', category: 'system' },
  { key: 'auth', category: 'auth' },
  { key: 'config', category: 'config' },
  { key: 'api', category: 'api' },
  { key: 'servers', to: '/settings/servers' },
  { key: 'storage', to: '/settings/storage' },
  { key: 'web', category: 'web' },
  { key: 'images', category: 'images' },
  { key: 'logging', category: 'logging' },
  { key: 'network', category: 'network' },
  { key: 'mail', category: 'mail' },
  { key: 'upload', category: 'upload' },
  { key: 'x10', category: 'x10' },
  { key: 'control', to: '/settings/ptz-controls' },
  { key: 'mqtt', category: 'mqtt' },
  { key: 'telemetry', category: 'telemetry' },
  { key: 'version', category: 'version' },
  { key: 'users', to: '/settings/users' },
  { key: 'groups', to: '/groups' },
  { key: 'state', to: '/settings/state' },
];

export function buildOptionsTabs(
  categories: readonly CategoryCount[],
  x10Enabled: boolean,
): OptionsTab[] {
  const visible = visibleCategories(categories, x10Enabled);
  // Preserve the backend's spelling (`MQTT`) — it is the filter value.
  const byLower = new Map(visible.map((c) => [c.name.toLowerCase(), c.name]));
  const used = new Set<string>();
  const tabs: OptionsTab[] = [];
  const extras: OptionsTab[] = [];

  for (const entry of LEGACY_ORDER) {
    if ('to' in entry) {
      tabs.push({ kind: 'page', key: entry.key, to: entry.to });
      continue;
    }
    const actual = byLower.get(entry.category);
    if (!actual) continue;
    used.add(entry.category);
    tabs.push({ kind: 'category', key: entry.key, category: actual });
  }
  for (const c of visible) {
    if (!used.has(c.name.toLowerCase())) {
      extras.push({ kind: 'category', key: c.name.toLowerCase(), category: c.name });
    }
  }
  // Extras slot in after the last category tab, ahead of Users/Groups/Run State.
  const lastCategory = tabs.map((t) => t.kind).lastIndexOf('category');
  tabs.splice(lastCategory + 1, 0, ...extras);
  return tabs;
}

/** Legacy tab captions; falls back to the raw key for unknown categories. */
export function optionsTabLabel(t: TFunction, key: string): string {
  switch (key) {
    case DISPLAY_TAB: return t('Display');
    case 'system': return t('System');
    case 'auth': return t('Auth');
    case 'config': return t('Config');
    case 'api': return t('API');
    case 'servers': return t('Servers');
    case 'storage': return t('Storage');
    case 'web': return t('Web');
    case 'images': return t('Images');
    case 'logging': return t('Logging');
    case 'network': return t('Network');
    case 'mail': return t('Email');
    case 'upload': return t('Upload');
    case 'x10': return t('X10');
    case 'control': return t('Control');
    case 'mqtt': return t('MQTT');
    case 'telemetry': return t('Telemetry');
    case 'version': return t('Versions');
    case 'users': return t('Users');
    case 'groups': return t('Groups');
    case 'state': return t('Run State');
    default: return key;
  }
}
