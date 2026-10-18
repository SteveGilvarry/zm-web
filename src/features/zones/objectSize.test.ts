/**
 * The object-size tool's arithmetic, against legacy `zone-object-size.js`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_OBJECT_RATIOS, boxFromCorners, centredBox, loadObjectRatios, normalizeRatio,
  objectThresholdPixels, objectTooNarrowToFilter, saveObjectRatio, zoneSettingsForObject,
} from './objectSize';
import { validateZoneForm } from './zoneValidation';

const t = ((key: string) => key) as unknown as Parameters<typeof validateZoneForm>[1];

afterEach(() => window.localStorage.clear());

describe('objectThresholdPixels', () => {
  it('takes 25% of the box, 70% of that, then 86% of that by default', () => {
    const px = objectThresholdPixels(10_000, DEFAULT_OBJECT_RATIOS)!;
    expect(px.alarm).toBe(2500);
    expect(px.filter).toBeCloseTo(1750);
    expect(px.blob).toBeCloseTo(1505);
  });

  it('measures nothing from an empty box', () => {
    expect(objectThresholdPixels(0, DEFAULT_OBJECT_RATIOS)).toBeNull();
  });
});

describe('zoneSettingsForObject', () => {
  it('switches to Blobs, fills the minimums in whole pixels and clears every maximum', () => {
    const s = zoneSettingsForObject(100 * 80, 200_000, {}, DEFAULT_OBJECT_RATIOS)!;
    expect(s).toEqual({
      checkMethod: 'Blobs',
      min_pixel_threshold: '40', max_pixel_threshold: '',
      filter_x: '3', filter_y: '3',
      min_alarm_pixels: '2000', max_alarm_pixels: '',
      min_filter_pixels: '1400', max_filter_pixels: '',
      min_blob_pixels: '1204', max_blob_pixels: '',
      min_blobs: '1', max_blobs: '',
      overload_frames: '0',
    });
  });

  it('keeps a pixel threshold and filter size the operator already set', () => {
    const s = zoneSettingsForObject(8000, 200_000, { min_pixel_threshold: '25', filter_x: '5', filter_y: '7' }, DEFAULT_OBJECT_RATIOS)!;
    expect([s.min_pixel_threshold, s.filter_x, s.filter_y]).toEqual(['25', '5', '7']);
  });

  it('never writes 0, which the analyser reads as no minimum', () => {
    const s = zoneSettingsForObject(2, 200_000, {}, DEFAULT_OBJECT_RATIOS)!;
    expect(s.min_blob_pixels).toBe('1');
  });

  it('never writes more than the zone holds', () => {
    const s = zoneSettingsForObject(1_000_000, 1000, {}, { fraction: 100, filter: 100, blob: 100 })!;
    expect(s.min_alarm_pixels).toBe('1000');
  });

  it('produces settings that pass validateForm', () => {
    const s = zoneSettingsForObject(120 * 60, 500_000, {}, DEFAULT_OBJECT_RATIOS)!;
    expect(validateZoneForm({
      type: 'Active', checkMethod: s.checkMethod,
      alarmRgb: { r: '255', g: '0', b: '0' },
      minPixelThreshold: s.min_pixel_threshold, maxPixelThreshold: s.max_pixel_threshold,
      filterX: s.filter_x, filterY: s.filter_y,
      minAlarmPixels: s.min_alarm_pixels, maxAlarmPixels: s.max_alarm_pixels,
      minFilterPixels: s.min_filter_pixels, maxFilterPixels: s.max_filter_pixels,
      minBlobPixels: s.min_blob_pixels, maxBlobPixels: s.max_blob_pixels,
      minBlobs: s.min_blobs, maxBlobs: s.max_blobs,
      selfIntersecting: false,
    }, t)).toEqual([]);
  });

  it('declines without a zone area to measure against', () => {
    expect(zoneSettingsForObject(8000, 0, {}, DEFAULT_OBJECT_RATIOS)).toBeNull();
  });
});

describe('objectTooNarrowToFilter', () => {
  it('flags a box narrower than the kernel on either axis, but not one that fits exactly', () => {
    expect(objectTooNarrowToFilter(2, 50, 3, 3)).toBe(true);
    expect(objectTooNarrowToFilter(50, 4, 5, 5)).toBe(true);
    expect(objectTooNarrowToFilter(5, 5, 5, 5)).toBe(false);
    // An unset filter still means the 3×3 minimum.
    expect(objectTooNarrowToFilter(2, 2, 0, 0)).toBe(true);
  });
});

describe('ratios', () => {
  it('accepts whole percentages 1–100 only', () => {
    expect(normalizeRatio('70.4')).toBe(70);
    expect(normalizeRatio(0)).toBeNull();
    expect(normalizeRatio('101')).toBeNull();
    expect(normalizeRatio('')).toBeNull();
  });

  it('remembers a ratio across visits, like legacy\'s cookies', () => {
    expect(loadObjectRatios()).toEqual(DEFAULT_OBJECT_RATIOS);
    saveObjectRatio('filter', 60);
    expect(loadObjectRatios()).toEqual({ ...DEFAULT_OBJECT_RATIOS, filter: 60 });
  });

  it('ignores a stored ratio that is out of range', () => {
    window.localStorage.setItem('zmZoneBlobRatio', '500');
    expect(loadObjectRatios().blob).toBe(86);
  });
});

describe('boxes', () => {
  it('normalises drag corners in any direction', () => {
    expect(boxFromCorners({ x: 50, y: 40 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 40, h: 20 });
  });

  it('centres a typed size in the frame, clamped to it', () => {
    expect(centredBox(100, 50, { width: 1000, height: 500 })).toEqual({ x: 450, y: 225, w: 100, h: 50 });
    expect(centredBox(5000, 50, { width: 1000, height: 500 })).toEqual({ x: 0, y: 225, w: 1000, h: 50 });
    expect(centredBox(0, 50, { width: 1000, height: 500 })).toBeNull();
  });
});
