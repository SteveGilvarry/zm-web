/**
 * The object-size tool's arithmetic (legacy `views/js/zone-object-size.js`):
 * draw a box round the smallest object that should alarm, and the zone's
 * thresholds follow from its size.
 *
 * Legacy works in its 0–100 percent space and stores the area thresholds as
 * percentages of the zone. This editor keeps the polygon in capture pixels,
 * and the daemon reads the thresholds of an integer-coordinate zone as pixel
 * counts (`zm_zone.cpp:1060-1076`), so the same derivation lands in pixels
 * here and skips the percent round trip.
 */

/** definezone.rst [G]. Above the Default preset's 25. */
export const DEFAULT_PIXEL_THRESHOLD = 40;

/** `limitFilter` keeps the kernel odd within 3..15, so 3 is the smallest. */
export const MIN_FILTER_KERNEL = 3;

/**
 * The three ratios and their defaults (`zone.php:133-137`): 25% of the box is
 * the object itself, and 70% / 86% match every shipped Blobs preset.
 */
export interface ObjectRatios {
  /** Share of the drawn box that alarms, 1–100. */
  fraction: number;
  /** Share of the alarmed area that survives filtering, 1–100. */
  filter: number;
  /** Share of the filtered area that forms the blob, 1–100. */
  blob: number;
}

export const DEFAULT_OBJECT_RATIOS: ObjectRatios = { fraction: 25, filter: 70, blob: 86 };

/** The settings the tool writes, keyed as the zone form holds them. */
export interface ObjectZoneSettings {
  checkMethod: 'Blobs';
  min_pixel_threshold: string;
  max_pixel_threshold: string;
  filter_x: string;
  filter_y: string;
  min_alarm_pixels: string;
  max_alarm_pixels: string;
  min_filter_pixels: string;
  max_filter_pixels: string;
  min_blob_pixels: string;
  max_blob_pixels: string;
  min_blobs: string;
  max_blobs: string;
  overload_frames: string;
}

/**
 * Pixel counts for the alarmed, filtered and blob areas. A blob is built from
 * pixels that survived filtering, so blob ≤ filter ≤ alarm holds by
 * construction — which is what `validateForm` asks before a save.
 */
export function objectThresholdPixels(
  boxPx: number,
  ratios: ObjectRatios,
): { alarm: number; filter: number; blob: number } | null {
  if (!(boxPx > 0)) return null;
  const alarm = (ratios.fraction / 100) * boxPx;
  const filter = alarm * (ratios.filter / 100);
  return { alarm, filter, blob: filter * (ratios.blob / 100) };
}

/**
 * Whole pixels, never 0 — `CheckAlarms` reads 0 as "no minimum at all" (the
 * reason legacy floors its percentages at 0.01) — and never more than the
 * zone holds.
 */
function asPixelField(px: number, zonePx: number): string {
  return String(Math.min(Math.round(zonePx), Math.max(1, Math.round(px))));
}

const blank = (v: string | undefined) => v == null || v.trim() === '';

/**
 * Legacy's `zoneSettingsForObject`. Size only: a pixel threshold and filter
 * size the operator already set are kept. Every maximum is cleared — one box
 * cannot imply a ceiling when the same object is far bigger up close.
 */
export function zoneSettingsForObject(
  boxPx: number,
  zonePx: number,
  current: { min_pixel_threshold?: string; filter_x?: string; filter_y?: string },
  ratios: ObjectRatios,
): ObjectZoneSettings | null {
  const px = objectThresholdPixels(boxPx, ratios);
  if (!px || !(zonePx > 0)) return null;
  return {
    checkMethod: 'Blobs',
    min_pixel_threshold: blank(current.min_pixel_threshold) ? String(DEFAULT_PIXEL_THRESHOLD) : current.min_pixel_threshold!,
    max_pixel_threshold: '',
    filter_x: blank(current.filter_x) ? String(MIN_FILTER_KERNEL) : current.filter_x!,
    filter_y: blank(current.filter_y) ? String(MIN_FILTER_KERNEL) : current.filter_y!,
    min_alarm_pixels: asPixelField(px.alarm, zonePx),
    max_alarm_pixels: '',
    min_filter_pixels: asPixelField(px.filter, zonePx),
    max_filter_pixels: '',
    min_blob_pixels: asPixelField(px.blob, zonePx),
    max_blob_pixels: '',
    min_blobs: '1',
    max_blobs: '',
    overload_frames: '0',
  };
}

/**
 * The filter keeps a pixel only if a whole FilterX × FilterY window covers
 * it, so a box narrower than the kernel on either axis is erased and the
 * zone silently stops alarming. A box that exactly fits survives.
 */
export function objectTooNarrowToFilter(wPx: number, hPx: number, filterX: number, filterY: number): boolean {
  return wPx < Math.max(filterX || 0, MIN_FILTER_KERNEL) || hPx < Math.max(filterY || 0, MIN_FILTER_KERNEL);
}

/** A ratio box holds a whole percentage 1–100, or nothing usable. */
export function normalizeRatio(value: string | number): number | null {
  const n = Math.round(typeof value === 'number' ? value : parseFloat(value));
  if (!(n >= 1) || !(n <= 100)) return null;
  return n;
}

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalise two drag corners into a box. */
export function boxFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): PixelBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/**
 * A typed object size as a box centred in the frame, so the tool can be
 * driven from the keyboard and the box drawn where it can be seen.
 */
export function centredBox(wPx: number, hPx: number, frame: { width: number; height: number }): PixelBox | null {
  if (!(wPx > 0) || !(hPx > 0) || !(frame.width > 0) || !(frame.height > 0)) return null;
  const w = Math.min(frame.width, wPx);
  const h = Math.min(frame.height, hPx);
  return { x: (frame.width - w) / 2, y: (frame.height - h) / 2, w, h };
}

/* ---------------------------------------------------------------------- */
/*  The ratios persist per browser, as legacy's cookies do                 */
/* ---------------------------------------------------------------------- */

const RATIO_KEYS: Record<keyof ObjectRatios, string> = {
  fraction: 'zmZoneObjectFraction',
  filter: 'zmZoneFilterRatio',
  blob: 'zmZoneBlobRatio',
};

export function loadObjectRatios(): ObjectRatios {
  const out = { ...DEFAULT_OBJECT_RATIOS };
  for (const key of Object.keys(RATIO_KEYS) as (keyof ObjectRatios)[]) {
    try {
      const saved = normalizeRatio(window.localStorage.getItem(RATIO_KEYS[key]) ?? '');
      if (saved != null) out[key] = saved;
    } catch {
      // Storage blocked: the defaults stand.
    }
  }
  return out;
}

export function saveObjectRatio(key: keyof ObjectRatios, value: number): void {
  try {
    window.localStorage.setItem(RATIO_KEYS[key], String(value));
  } catch {
    // Storage blocked: the ratio lasts for this page only.
  }
}
