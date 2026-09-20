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
 * and wording (`web/skins/classic/views/zone.php`) — the zone as the backend
 * currently has it, beside the editor form that is changing it.
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

/* ------------------------------------------------------------------------ */
/*  Which settings the zone's Type and Check Method leave editable           */
/* ------------------------------------------------------------------------ */

/** The writable motion settings, keyed the way `ZoneSettingsPayload` is. */
export const ZONE_SETTING_FIELDS = [
  'check_method',
  'min_pixel_threshold', 'max_pixel_threshold',
  'min_alarm_pixels', 'max_alarm_pixels',
  'filter_x', 'filter_y',
  'min_filter_pixels', 'max_filter_pixels',
  'min_blob_pixels', 'max_blob_pixels',
  'min_blobs', 'max_blobs',
  'alarm_rgb',
  'overload_frames', 'extend_alarm_frames',
] as const;

export type ZoneSettingField = (typeof ZONE_SETTING_FIELDS)[number];

export type ZoneFieldEnabled = Record<ZoneSettingField, boolean>;

function allFields(enabled: boolean): ZoneFieldEnabled {
  return Object.fromEntries(ZONE_SETTING_FIELDS.map((f) => [f, enabled])) as ZoneFieldEnabled;
}

/**
 * Legacy's `applyZoneType` + `applyCheckMethod` (`views/js/zone.js:111-195`),
 * as data instead of a pile of `.disabled =` assignments.
 *
 * - `Inactive` / `Privacy` detect nothing, so every setting is off.
 * - `Preclusive` rejects the whole frame, so it has no alarm colour, and it
 *   is the one type where Extend Alarm Frames applies.
 * - Otherwise everything is on except Extend Alarm Frames.
 *
 * On top of that the check method reveals rows in turn: `AlarmedPixels` uses
 * the pixel and alarm-area numbers only, `FilteredPixels` adds the filter
 * size and filtered area, `Blobs` adds the blob area and blob counts.
 */
export function zoneFieldEnabled(type: string, checkMethod: string): ZoneFieldEnabled {
  if (type === 'Inactive' || type === 'Privacy') return allFields(false);

  const preclusive = type === 'Preclusive';
  const filtered = checkMethod === 'FilteredPixels' || checkMethod === 'Blobs';
  const blobs = checkMethod === 'Blobs';

  return {
    check_method: true,
    min_pixel_threshold: true,
    max_pixel_threshold: true,
    min_alarm_pixels: true,
    max_alarm_pixels: true,
    filter_x: filtered,
    filter_y: filtered,
    min_filter_pixels: filtered,
    max_filter_pixels: filtered,
    min_blob_pixels: blobs,
    max_blob_pixels: blobs,
    min_blobs: blobs,
    max_blobs: blobs,
    alarm_rgb: !preclusive,
    overload_frames: true,
    extend_alarm_frames: preclusive,
  };
}

/** `#rrggbb` back to the packed integer `Zones.AlarmRGB` holds. */
export function hexToAlarmRgb(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? parseInt(m[1], 16) : null;
}
