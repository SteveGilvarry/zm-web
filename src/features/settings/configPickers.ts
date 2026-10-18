import type { TFunction } from 'i18next';
import { LANGUAGES } from '@/i18n/languages';
import { HOME_VIEWS } from '@/features/users/useAccountForm';
import { skinIds } from '@/skins/registry';
import type { ZmConfig } from '@/types';

export interface PickerOption {
  value: string;
  label: string;
}

/**
 * Options whose Config row carries no usable hint but which legacy
 * `options.php:178-246` turns into a list built on the server: the time
 * zone, home view, default language and locale, and the default skin and
 * CSS. Here the lists come from what the browser and the app know.
 * Returns null for every other option.
 *
 * A stored value the list does not know is kept as its own option, so
 * opening the tab never rewrites a setting nobody touched.
 */
export function configPickerOptions(config: Pick<ZmConfig, 'name' | 'value'>, t: TFunction): PickerOption[] | null {
  const list = baseOptions(config.name, t);
  if (!list) return null;
  if (!list.some((o) => o.value === config.value)) list.push({ value: config.value, label: config.value });
  return list;
}

function baseOptions(name: string, t: TFunction): PickerOption[] | null {
  switch (name) {
    case 'ZM_TIMEZONE':
      return [{ value: '', label: t('Unset - use value in php.ini') }, ...cachedTimezoneOptions()];
    case 'ZM_WEB_HOMEVIEW': {
      const label: Record<(typeof HOME_VIEWS)[number], string> = {
        console: t('Console'),
        events: t('Events'),
        map: t('Map'),
        montage: t('Montage'),
        montagereview: t('Montage Review'),
        watch: t('Watch'),
      };
      return HOME_VIEWS.map((v) => ({ value: v, label: label[v] }));
    }
    case 'ZM_LANG_DEFAULT':
      // ZoneMinder stores the `web/lang/<file>` name.
      return LANGUAGES.filter((l) => l.zmFile).map((l) => ({ value: l.zmFile as string, label: l.nativeName }));
    case 'ZM_LOCALE_DEFAULT':
      // ICU spells a locale with underscores (`pt_BR`); '' is the host's.
      return [
        { value: '', label: t('System Default') },
        ...LANGUAGES.map((l) => ({ value: l.code.replace(/-/g, '_'), label: l.code.replace(/-/g, '_') })),
      ];
    case 'ZM_SKIN_DEFAULT':
      return skinIds.map((id) => ({ value: id, label: id }));
    case 'ZM_CSS_DEFAULT':
      // The classic skin's three stylesheets (`skins/classic/css/*`).
      return ['base', 'classic', 'dark'].map((v) => ({ value: v, label: v }));
    default:
      return null;
  }
}

// ~400 formatter calls: build the list once an hour, not on every render
// of the form around it.
let tzCache: { hour: number; list: PickerOption[] } | null = null;
function cachedTimezoneOptions(): PickerOption[] {
  const hour = Math.floor(Date.now() / 3_600_000);
  if (!tzCache || tzCache.hour !== hour) tzCache = { hour, list: timezoneOptions() };
  return tzCache.list;
}

/** `GMT`, `GMT+05:30`, `GMT-03:00`: legacy `format_GMT_offset`. */
export function gmtOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'GMT';
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `GMT${sign}${hh}:${mm}`;
}

/** Offset of `zone` from UTC at `at`, in minutes. */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** `America/Argentina/Buenos_Aires` → `America, Argentina, Buenos Aires` (`format_timezone_name`). */
export function formatZoneName(zone: string): string {
  return zone.replace(/\//g, ', ').replace(/_/g, ' ').replace(/St /g, 'St. ');
}

/**
 * Every IANA zone the browser knows, labelled "(GMT+hh:mm) Region, City"
 * and sorted by offset now, then by name, as legacy `timezone_list()`.
 */
export function timezoneOptions(at: Date = new Date()): PickerOption[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const all = zones.includes('UTC') ? zones : [...zones, 'UTC'];
  return all
    .map((zone) => ({ zone, offset: zoneOffsetMinutes(zone, at) }))
    .sort((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone))
    .map(({ zone, offset }) => ({ value: zone, label: `(${gmtOffsetLabel(offset)}) ${formatZoneName(zone)}` }));
}
