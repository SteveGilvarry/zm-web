import { useTranslation } from 'react-i18next';
import type { PlaybackScale, ReplayMode } from '@/stores/eventPlayback';

/**
 * Translated option lists for the event player's Replay / Scale selects.
 * The wire values live in `@/stores/eventPlayback`; the labels are built
 * here so `t()` sees literal keys.
 */
export function useReplayModeOptions(): ReadonlyArray<{ value: ReplayMode; label: string }> {
  const { t } = useTranslation();
  return [
    { value: 'single',  label: t('Single') },
    { value: 'all',     label: t('All') },
    { value: 'gapless', label: t('Gapless') },
  ];
}

export function useScaleOptions(): ReadonlyArray<{ value: PlaybackScale; label: string }> {
  const { t } = useTranslation();
  return [
    { value: 'auto', label: t('Auto') },
    { value: '25',   label: '25%' },
    { value: '50',   label: '50%' },
    { value: '75',   label: '75%' },
    { value: '100',  label: '100%' },
    { value: '150',  label: '150%' },
    { value: '200',  label: '200%' },
  ];
}
