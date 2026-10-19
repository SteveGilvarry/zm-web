import type { FieldValue } from './fields';

/**
 * Legacy refreshes the meter every second (`monitor.js`
 * `startAudioLevelMeter`). zm-api allows one request a second for the
 * whole app, so a one-second poll would starve every other query on the
 * page; two seconds still moves with a voice and stays well inside zmc's
 * measuring window, which each poll extends by a few seconds.
 */
export const AUDIO_LEVEL_POLL_MS = 2000;

/**
 * `levelMeterState` (`js/LevelGraph.js`): a missing reading says so instead
 * of showing a confident zero; a reading is clamped to 0-100.
 */
export function levelMeterState(
  level: number | null | undefined, alarm: boolean | null | undefined, message: string,
): { percent: number; text: string; alarm: boolean } {
  if (level == null || !Number.isFinite(level)) return { percent: 0, text: message, alarm: false };
  const clamped = Math.min(Math.max(Math.round(level), 0), 100);
  return { percent: clamped, text: String(clamped), alarm: !!alarm };
}

/** `levelThresholdPercent`: 0 means detection is off, so no mark. */
export function levelThresholdPercent(threshold: FieldValue | undefined): number | null {
  const value = parseInt(String(threshold ?? ''), 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, 100);
}
