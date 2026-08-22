import type { TFunction } from 'i18next';
import type { Zone } from '@/api/zones';

/** What we print where the backend sent null — never "0", never "null". */
const DASH = '—';

/**
 * Decode ZoneMinder's packed `Zones.AlarmRGB` column — saved as
 * `(R << 16) | (G << 8) | B` — into a CSS `#rrggbb`.
 *
 * Returns null when there is no colour to show (the backend sends null for
 * zones created before the column was populated), so callers can skip the
 * swatch entirely instead of painting a bogus black chip.
 */
export function alarmRgbToHex(rgb: number | null | undefined): string | null {
  if (rgb == null || !Number.isFinite(rgb) || rgb < 0) return null;
  // Mask to the 24 bits the column actually holds.
  const v = Math.floor(rgb) & 0xffffff;
  return `#${v.toString(16).padStart(6, '0')}`;
}

/** Legacy's Check Method select options, which spell the enum with spaces. */
export function zoneCheckMethodLabel(method: string | undefined, t: TFunction): string {
  switch (method) {
    case 'AlarmedPixels': return t('Alarmed Pixels');
    case 'FilteredPixels': return t('Filtered Pixels');
    case 'Blobs': return t('Blobs');
    default: return method || DASH;
  }
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * The alarm / filter / blob thresholds are stored in the zone's own `Units`,
 * so a Percent zone reports "0.05%" where a Pixels zone reports "3,456" —
 * the same thing legacy does with its per-unit `step` attributes.
 */
function threshold(value: number | null | undefined, units: string): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return units === 'Percent' ? `${num(value)}%` : num(value);
}

function pair(min: string, max: string): string {
  return `${min} / ${max}`;
}

export interface ZoneSettingRow {
  /** Stable identity for React keys and tests. */
  key: string;
  label: string;
  /** Localised, ready to print; an em dash wherever the backend sent null. */
  value: string;
  /** CSS colour for a swatch chip; only the alarm-colour row carries one. */
  swatch?: string;
}

/**
 * The legacy zone editor's right-hand settings panel, in legacy's own order
 * and wording (`web/skins/classic/views/zone.php`). Read-only: zm-api's
 * `UpdateZoneRequest` still takes nothing but `name` and `polygon`, so there
 * is deliberately no writable counterpart to this list.
 *
 * Needs zm-api ≥ the zone-detail work (zm-api#22) — an older build omits
 * every field below and each row would read as an em dash.
 */
export function zoneSettingRows(zone: Zone, t: TFunction): ZoneSettingRow[] {
  const units = zone.units;
  const hex = alarmRgbToHex(zone.alarm_rgb);

  return [
    {
      key: 'alarm_rgb',
      label: t('Alarm Colour'),
      value: hex ?? DASH,
      ...(hex ? { swatch: hex } : {}),
    },
    { key: 'check_method', label: t('Check Method'), value: zoneCheckMethodLabel(zone.check_method, t) },
    {
      key: 'pixel_threshold',
      label: t('Min/Max Pixel Threshold'),
      value: pair(num(zone.min_pixel_threshold), num(zone.max_pixel_threshold)),
    },
    {
      key: 'filter_size',
      label: t('Filter Width/Height'),
      value: pair(num(zone.filter_x), num(zone.filter_y)),
    },
    { key: 'area', label: t('Zone Area'), value: num(zone.area) },
    {
      key: 'alarm_pixels',
      label: t('Min/Max Alarmed Area'),
      value: pair(threshold(zone.min_alarm_pixels, units), threshold(zone.max_alarm_pixels, units)),
    },
    {
      key: 'filter_pixels',
      label: t('Min/Max Filtered Area'),
      value: pair(threshold(zone.min_filter_pixels, units), threshold(zone.max_filter_pixels, units)),
    },
    {
      key: 'blob_pixels',
      label: t('Min/Max Blob Area'),
      value: pair(threshold(zone.min_blob_pixels, units), threshold(zone.max_blob_pixels, units)),
    },
    {
      key: 'blobs',
      label: t('Min/Max Blobs'),
      value: pair(num(zone.min_blobs), num(zone.max_blobs)),
    },
    { key: 'overload_frames', label: t('Overload Frame Ignore Count'), value: num(zone.overload_frames) },
    { key: 'extend_alarm_frames', label: t('Extend Alarm Frame Count'), value: num(zone.extend_alarm_frames) },
  ];
}
