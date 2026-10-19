import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { getAudioLevel } from '@/api/monitorStatus';
import type { FieldValue } from './fields';
import { AUDIO_LEVEL_POLL_MS, levelMeterState, levelThresholdPercent } from './audioLevel';

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
