/**
 * The read-only motion-settings panel behind both skins: the packed
 * `AlarmRGB` decode and the legacy row list.
 */
import { describe, expect, it } from 'vitest';
import { makeZone } from '@/test/fixtures';
import { alarmRgbToHex, zoneCheckMethodLabel, zoneSettingRows } from './zoneSettings';

/** The tests read English keys straight back, like i18n does with no catalogue. */
const t = ((key: string) => key) as unknown as Parameters<typeof zoneSettingRows>[1];

const rows = (zone = makeZone()) =>
  Object.fromEntries(zoneSettingRows(zone, t).map((r) => [r.key, r.value]));

describe('alarmRgbToHex', () => {
  it('decodes ZoneMinder\'s packed (R<<16)|(G<<8)|B integer', () => {
    expect(alarmRgbToHex(16711680)).toBe('#ff0000'); // the ZM default red
    expect(alarmRgbToHex(65280)).toBe('#00ff00');
    expect(alarmRgbToHex(255)).toBe('#0000ff');
    expect(alarmRgbToHex(0)).toBe('#000000');
    expect(alarmRgbToHex(0xffffff)).toBe('#ffffff');
  });

  it('pads short values to six hex digits', () => {
    expect(alarmRgbToHex(1)).toBe('#000001');
    expect(alarmRgbToHex(0x0000ab)).toBe('#0000ab');
  });

  it('returns null when there is no colour to paint', () => {
    // null → the caller renders an em dash and no swatch at all.
    expect(alarmRgbToHex(null)).toBeNull();
    expect(alarmRgbToHex(undefined)).toBeNull();
    expect(alarmRgbToHex(Number.NaN)).toBeNull();
    expect(alarmRgbToHex(-1)).toBeNull();
  });

  it('ignores bits above the 24 the column holds', () => {
    expect(alarmRgbToHex(0xff_00_00_00 + 0xff0000)).toBe('#ff0000');
  });
});

describe('zoneCheckMethodLabel', () => {
  it('spells the enum the way legacy\'s select does', () => {
    expect(zoneCheckMethodLabel('AlarmedPixels', t)).toBe('Alarmed Pixels');
    expect(zoneCheckMethodLabel('FilteredPixels', t)).toBe('Filtered Pixels');
    expect(zoneCheckMethodLabel('Blobs', t)).toBe('Blobs');
  });

  it('echoes an unknown method and dashes an empty one', () => {
    expect(zoneCheckMethodLabel('Neural', t)).toBe('Neural');
    expect(zoneCheckMethodLabel(undefined, t)).toBe('—');
  });
});

describe('zoneSettingRows', () => {
  it('lists legacy\'s settings in legacy\'s order', () => {
    expect(zoneSettingRows(makeZone(), t).map((r) => r.key)).toEqual([
      'alarm_rgb', 'check_method', 'pixel_threshold', 'filter_size', 'area',
      'alarm_pixels', 'filter_pixels', 'blob_pixels', 'blobs',
      'overload_frames', 'extend_alarm_frames',
    ]);
    expect(zoneSettingRows(makeZone(), t).map((r) => r.label)).toEqual([
      'Alarm Colour', 'Check Method', 'Min/Max Pixel Threshold', 'Filter Width/Height',
      'Zone Area', 'Min/Max Alarmed Area', 'Min/Max Filtered Area', 'Min/Max Blob Area',
      'Min/Max Blobs', 'Overload Frame Ignore Count', 'Extend Alarm Frame Count',
    ]);
  });

  it('carries the alarm colour as both a swatch and its hex', () => {
    const [colour] = zoneSettingRows(makeZone({ alarm_rgb: 16711680 }), t);
    expect(colour.value).toBe('#ff0000');
    expect(colour.swatch).toBe('#ff0000');
  });

  it('drops the swatch when the backend sent no colour', () => {
    const [colour] = zoneSettingRows(makeZone({ alarm_rgb: null }), t);
    expect(colour.value).toBe('—');
    expect(colour.swatch).toBeUndefined();
  });

  it('renders a null setting as an em dash, never 0 or "null"', () => {
    const r = rows(makeZone({
      max_pixel_threshold: null, max_alarm_pixels: null, min_blobs: null, max_blobs: null,
      filter_x: null, filter_y: null,
    }));
    expect(r.pixel_threshold).toBe('25 / —');
    expect(r.filter_size).toBe('— / —');
    expect(r.blobs).toBe('— / —');
    expect(r.alarm_pixels).toMatch(/ \/ —$/); // min and max share one row
  });

  it('keeps a real zero as zero', () => {
    const r = rows(makeZone({ overload_frames: 0, extend_alarm_frames: 3 }));
    expect(r.overload_frames).toBe('0');
    expect(r.extend_alarm_frames).toBe('3');
  });

  it('suffixes the area thresholds with % for a Percent zone', () => {
    // Live values from monitor 1: Percent units, fractional thresholds.
    const r = rows(makeZone({
      units: 'Percent',
      min_alarm_pixels: 0.05, max_alarm_pixels: 75.06,
      min_filter_pixels: 0.05, max_filter_pixels: 75.06,
      min_blob_pixels: 0.05, max_blob_pixels: null,
    }));
    expect(r.alarm_pixels).toBe('0.05% / 75.06%');
    expect(r.filter_pixels).toBe('0.05% / 75.06%');
    expect(r.blob_pixels).toBe('0.05% / —');
    // The pixel threshold is a greyscale delta, not an area — never suffixed.
    expect(r.pixel_threshold).toBe('25 / —');
  });

  it('leaves the thresholds unsuffixed and grouped for a Pixels zone', () => {
    const r = rows(makeZone({
      units: 'Pixels', min_alarm_pixels: 3456, max_alarm_pixels: 691200,
    }));
    expect(r.alarm_pixels).toBe('3,456 / 691,200');
  });

  it('prints the backend\'s stored area', () => {
    expect(rows(makeZone({ area: 9926 })).area).toBe('9,926');
  });
});
