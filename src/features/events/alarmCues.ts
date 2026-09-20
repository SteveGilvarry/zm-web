import type { Frame } from '@/api/frames';

/** Legacy `renderAlarmCues` draws exactly ten labels across the bar. */
export const SCRUBBER_LABEL_COUNT = 10;

/**
 * What legacy's `renderAlarmCues` counts as an alarm on the progress bar:
 * `Type == 'Alarm'` and nothing else (J:212). Bulk frames are the sampled
 * frames of a continuous recording, so treating them as alarms would paint
 * the whole bar red on every continuous event.
 */
export function isAlarmFrame(f: Frame): boolean {
  return f.type === 'Alarm';
}

export interface AlarmRun {
  /** Seconds from the event start. */
  start: number;
  end: number;
  /** Peak score across the run. */
  score: number;
}

/**
 * Contiguous stretches of alarm frames, which is what legacy's `alarmCue`
 * spans mark out. Each run is drawn from the first alarm frame's delta to
 * the last one's, so a one-frame alarm still gets a visible sliver.
 *
 * Legacy takes the span's height from the frame that closes the run, which
 * is whichever one happened to be last; the peak is what an operator
 * scanning the bar is actually looking for.
 */
export function alarmRuns(frames: Frame[]): AlarmRun[] {
  const runs: AlarmRun[] = [];
  let open: AlarmRun | null = null;
  for (const f of frames) {
    const at = parseFloat(f.delta);
    if (!Number.isFinite(at)) continue;
    if (isAlarmFrame(f)) {
      if (open) {
        open.end = at;
        open.score = Math.max(open.score, f.score);
      } else {
        open = { start: at, end: at, score: f.score };
      }
    } else if (open) {
      open.end = at;
      runs.push(open);
      open = null;
    }
  }
  if (open) runs.push(open);
  return runs;
}
