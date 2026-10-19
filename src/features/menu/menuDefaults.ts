import type { TFunction } from 'i18next';
import type { MenuItem } from '@/api/menuItems';

/** The navbar entries ZoneMinder builds itself (`getMenuItemFunctions()`). */
export const BUILTIN_MENU_KEYS = [
  'Console', 'Watch', 'Montage', 'MontageReview', 'Events', 'Options', 'Log', 'Devices',
  'IntelGpu', 'Groups', 'Filters', 'Snapshots', 'Reports', 'ReportEventAudit', 'Map',
] as const;

export function isBuiltinMenuKey(key: string): boolean {
  return (BUILTIN_MENU_KEYS as readonly string[]).includes(key);
}

/** `MenuItem::$defaultIcons`: Material icon names; anything else falls back to `menu`. */
export const DEFAULT_MENU_ICONS: Readonly<Record<string, string>> = {
  Console: 'dashboard',
  Montage: 'live_tv',
  MontageReview: 'movie',
  Events: 'event',
  Options: 'settings',
  Log: 'notification_important',
  Devices: 'devices_other',
  IntelGpu: 'memory',
  Groups: 'group',
  Filters: 'filter_alt',
  Snapshots: 'preview',
  Reports: 'report',
  ReportEventAudit: 'shield',
  Map: 'language',
};

/**
 * Where a built-in entry goes in this dashboard. Legacy's `?view=` hrefs
 * (`getMenuKeyHrefMap()`) translated to routes; entries with no page here
 * (Devices, Intel GPU, Snapshots, Map) map to null.
 */
const BUILTIN_ROUTES: Readonly<Record<string, string | null>> = {
  Console: '/',
  Watch: '/cycle',
  Montage: '/montage',
  MontageReview: '/montagereview',
  Events: '/events',
  Options: '/settings',
  Log: '/logs',
  Devices: null,
  IntelGpu: null,
  Groups: '/groups',
  Filters: '/filters',
  Snapshots: null,
  Reports: '/reports',
  ReportEventAudit: '/audit',
  Map: null,
};

/** The caption legacy shows for a key (`translate($MenuKey)`). */
export function defaultMenuLabel(t: TFunction, key: string): string {
  switch (key) {
    case 'Console': return t('Console');
    case 'Watch': return t('Watch');
    case 'Montage': return t('Montage');
    case 'MontageReview': return t('Montage Review');
    case 'Events': return t('Events');
    case 'Options': return t('Options');
    case 'Log': return t('Log');
    case 'Devices': return t('Devices');
    case 'IntelGpu': return t('Intel GPU');
    case 'Groups': return t('Groups');
    case 'Filters': return t('Filters');
    case 'Snapshots': return t('Snapshots');
    case 'Reports': return t('Reports');
    case 'ReportEventAudit': return t('Audit Events Report');
    case 'Map': return t('Map');
    default: return key;
  }
}

const filled = (v: string | null | undefined): v is string => v != null && v !== '';

/** `displayLabel()`: the custom label when set, else the key's caption. */
export function menuItemLabel(t: TFunction, item: Pick<MenuItem, 'menu_key' | 'label'>): string {
  return filled(item.label) ? item.label : defaultMenuLabel(t, item.menu_key);
}

/**
 * `menuItemEffectiveLink()`: the explicit Link when set; otherwise a
 * built-in's own page, and for a custom key legacy's `?view=<key>` rule.
 * Null when a built-in has no page in this dashboard.
 */
export function menuItemLink(item: Pick<MenuItem, 'menu_key' | 'link'>): string | null {
  if (filled(item.link)) return item.link;
  if (item.menu_key in BUILTIN_ROUTES) return BUILTIN_ROUTES[item.menu_key];
  return `?view=${item.menu_key}`;
}

/** `effectiveIcon()` / `effectiveIconType()`. */
export function menuItemIcon(item: Pick<MenuItem, 'menu_key' | 'icon' | 'icon_type'>): { icon: string; type: string } {
  if (item.icon_type === 'none') return { icon: '', type: 'none' };
  if (filled(item.icon)) return { icon: item.icon, type: item.icon_type || 'material' };
  return { icon: DEFAULT_MENU_ICONS[item.menu_key] ?? 'menu', type: 'material' };
}

export const ICON_TYPES = ['material', 'fontawesome', 'image', 'none'] as const;
