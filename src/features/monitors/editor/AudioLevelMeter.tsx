import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { getAudioLevel } from '@/api/monitorStatus';
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

/**
 * Legacy Analysis → Current Level (`monitor.php:1140`): a bar with the
 * live audio level, a mark where the threshold being typed sits, and the
 * number beside it. Polls only while mounted, which is while the Analysis
 * tab is showing; polling is also what asks zmc to measure at all.
 */
export function AudioLevelMeter({ monitorId, threshold }: { monitorId: number; threshold: FieldValue | undefined }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['monitor-audio-level', monitorId],
    queryFn: () => getAudioLevel(monitorId),
    refetchInterval: AUDIO_LEVEL_POLL_MS,
    retry: false,
    gcTime: 0,
  });
  const state = q.isError
    ? levelMeterState(null, false, t('unavailable'))
    : levelMeterState(q.data?.level, q.data?.alarm, q.data ? t('no reading') : '—');
  const mark = levelThresholdPercent(threshold);
  return (
    <div className="flex items-center gap-2" data-testid="audio-level-meter" dir="ltr">
      <div
        role="meter"
        aria-label={t('Current Level')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.percent}
        aria-valuetext={state.text}
        className="relative flex-1 max-w-[260px] h-3.5 rounded-sm border border-border bg-surface-3 overflow-hidden"
      >
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${state.percent}%` }} />
        {mark != null && (
          <div
            data-testid="audio-threshold-mark"
            className="absolute inset-y-0 w-0.5 -ms-px bg-danger"
            style={{ left: `${mark}%` }}
          />
        )}
      </div>
      <span
        className={clsx('min-w-[5em] text-sm tabular-nums', state.alarm && 'text-danger font-semibold')}
        aria-live="off"
      >
        {state.text}
      </span>
    </div>
  );
}
