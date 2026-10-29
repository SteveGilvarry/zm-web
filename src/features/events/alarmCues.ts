import type { Frame } from '@/api/frames';

/** Legacy `renderAlarmCues` draws exactly ten labels across the bar. */
export const SCRUBBER_LABEL_COUNT = 10;

/**
 * What legacy's level graph shades as an alarm period: `Type == 'Alarm'`
 * and nothing else (`levelGraphBands`). Bulk frames are the sampled
 * frames of a continuous recording, so treating them as alarms would paint
 * the whole bar red on every continuous event.
 */
export function isAlarmFrame(f: Frame): boolean {
  return f.type === 'Alarm';
}
