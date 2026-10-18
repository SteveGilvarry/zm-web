import type { TFunction } from 'i18next';

/**
 * The form values `validateForm` reads, as the boxes hold them — strings, so
 * an empty box is told apart from a zero the way legacy's `!value` does.
 * The area fields may be in pixels or percent: every rule compares two of
 * them or tests for > 0, so the unit does not change the outcome.
 */
export interface ZoneFormValues {
  type: string;
  checkMethod: string;
  alarmRgb: { r: string; g: string; b: string };
  minPixelThreshold: string;
  maxPixelThreshold: string;
  filterX: string;
  filterY: string;
  minAlarmPixels: string;
  maxAlarmPixels: string;
  minFilterPixels: string;
  maxFilterPixels: string;
  minBlobPixels: string;
  maxBlobPixels: string;
  minBlobs: string;
  maxBlobs: string;
  selfIntersecting: boolean;
}

/**
 * Legacy's `validateForm` (`views/js/zone.js:16-70`), rule for rule and in
 * its order, with its messages (`lang/en_gb.php`).
 *
 * - The polygon must not cross itself.
 * - Inactive and Privacy zones detect nothing, so nothing else is checked.
 * - Otherwise: an alarm colour; a minimum pixel threshold above 0 and below
 *   the maximum; a minimum alarmed area above 0 and below its maximum.
 * - FilteredPixels and Blobs add the filter size, a minimum filtered area
 *   above 0, below its maximum and no larger than the minimum alarmed area.
 * - Blobs adds a minimum blob area above 0, below its maximum and no larger
 *   than the minimum filtered area, and a minimum blob count above 0 and
 *   below its maximum.
 *
 * A maximum of 0 or empty means "no maximum", so it never fails a
 * min < max check. Each chain stops at its first failure (`else if`), the
 * way legacy's does. `parseInt` for counts and thresholds, `parseFloat` for
 * areas, as legacy reads them.
 */
export function validateZoneForm(v: ZoneFormValues, t: TFunction): string[] {
  const errors: string[] = [];
  if (v.selfIntersecting) errors.push(t('Polygon edges must not intersect'));
  if (v.type === 'Inactive' || v.type === 'Privacy') return errors;

  const int = (s: string) => parseInt(s, 10);
  const float = (s: string) => parseFloat(s);
  const filtered = v.checkMethod === 'FilteredPixels' || v.checkMethod === 'Blobs';

  if (!v.alarmRgb.r || !v.alarmRgb.g || !v.alarmRgb.b) {
    errors.push(t('You must set an alarm RGB colour'));
  }

  if (!v.minPixelThreshold || int(v.minPixelThreshold) <= 0) {
    errors.push(t('You must specify a minimum pixel threshold'));
  } else if (int(v.minPixelThreshold) >= int(v.maxPixelThreshold) && int(v.maxPixelThreshold) > 0) {
    errors.push(t('Minimum pixel threshold should be less than maximum'));
  }

  if (filtered && (!v.filterX || !v.filterY)) {
    errors.push(t('You must specify a filter width and height'));
  }

  if (!v.minAlarmPixels || float(v.minAlarmPixels) <= 0) {
    errors.push(t('You must specify the minimum alarm pixel count'));
  } else if (float(v.minAlarmPixels) >= float(v.maxAlarmPixels) && float(v.maxAlarmPixels) > 0) {
    errors.push(t('Minimum alarm area should be less than maximum'));
  }

  if (filtered) {
    if (!v.minFilterPixels || float(v.minFilterPixels) <= 0) {
      errors.push(t('You must specify the minimum filter pixel count'));
    } else if (float(v.minFilterPixels) >= float(v.maxFilterPixels) && float(v.maxFilterPixels) > 0) {
      errors.push(t('Minimum filter area should be less than maximum'));
    } else if (float(v.minAlarmPixels) < float(v.minFilterPixels)) {
      errors.push(t('Minimum filter area should be less than or equal to minimum alarm area'));
    }

    if (v.checkMethod === 'Blobs') {
      if (!v.minBlobPixels || float(v.minBlobPixels) <= 0) {
        errors.push(t('You must specify the minimum blob pixel count'));
      } else if (float(v.minBlobPixels) >= float(v.maxBlobPixels) && float(v.maxBlobPixels) > 0) {
        errors.push(t('Minimum blob area should be less than maximum'));
      } else if (float(v.minFilterPixels) < float(v.minBlobPixels)) {
        errors.push(t('Minimum blob area should be less than or equal to minimum filter area'));
      }
      if (!v.minBlobs || int(v.minBlobs) <= 0) {
        errors.push(t('You must specify the minimum blob count'));
      } else if (int(v.minBlobs) >= int(v.maxBlobs) && int(v.maxBlobs) > 0) {
        errors.push(t('Minimum blobs should be less than maximum'));
      }
    }
  }

  return errors;
}

/** Legacy's per-keystroke clamps (`zone.js:269-293`), for the boxes they guard. */
export function clampUnsignedByte(raw: string): string {
  if (raw === '') return raw;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(255, Math.max(0, n)));
}

/**
 * `limitFilter`: the filter is a square kernel, so it is odd and 3–15.
 * Legacy runs this on every keystroke, which makes "11" impossible to type
 * (the "1" becomes 3 first); here it runs when the box loses focus.
 */
export function clampFilterSize(raw: string): string {
  if (raw === '') return raw;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return '';
  const odd = Math.floor((n - 1) / 2) * 2 + 1;
  return String(Math.min(15, Math.max(3, odd)));
}
