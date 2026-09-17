import { useTranslation } from 'react-i18next';
import {
  PLAYBACK_RATES, type PlaybackCodec, type PlaybackScale, type ReplayMode,
} from '@/stores/eventPlayback';

/**
 * Translated option lists for the event player's Replay / Scale / Rate
 * selects. The wire values live in `@/stores/eventPlayback`; the labels are
 * built here so `t()` sees literal keys. Lists and labels follow
 * `skins/classic/includes/config.php` and `views/event.php`.
 */
export function useReplayModeOptions(): ReadonlyArray<{ value: ReplayMode; label: string }> {
  const { t } = useTranslation();
  return [
    { value: 'none',    label: t('None') },
    { value: 'single',  label: t('Single Event') },
    { value: 'all',     label: t('All Events') },
    { value: 'gapless', label: t('Gapless') },
  ];
}

export function useScaleOptions(): ReadonlyArray<{ value: PlaybackScale; label: string }> {
  const { t } = useTranslation();
  return [
    { value: '0',            label: t('Auto') },
    { value: '100',          label: t('Actual') },
    { value: 'fit_to_width', label: t('Fit to width') },
    { value: '480px',        label: t('Max 480px') },
    { value: '640px',        label: t('Max 640px') },
    { value: '800px',        label: t('Max 800px') },
    { value: '1024px',       label: t('Max 1024px') },
    { value: '1280px',       label: t('Max 1280px') },
    { value: '1600px',       label: t('Max 1600px') },
  ];
}

/** `-16x … -1/4x, Stop, 1/4x … 16x` — the legacy `$rates` labels. */
export function useRateOptions(): ReadonlyArray<{ value: number; label: string }> {
  const { t } = useTranslation();
  return PLAYBACK_RATES.map((value) => ({ value, label: value === 0 ? t('Stop') : rateLabel(value) }));
}

function rateLabel(rate: number): string {
  const sign = rate < 0 ? '-' : '';
  const abs = Math.abs(rate);
  if (abs === 0.25) return `${sign}1/4x`;
  if (abs === 0.5) return `${sign}1/2x`;
  return `${sign}${abs}x`;
}

/**
 * Legacy's Codec select. `Auto` follows the backend's recommendation; the
 * other two force the container. MJPEG is listed but unselectable: legacy
 * replays an event as JPEGs through `nph-zms`, and zm-api serves no
 * equivalent (there is no MJPEG endpoint for a recorded event).
 */
export function useCodecOptions(): ReadonlyArray<{
  value: PlaybackCodec | 'mjpeg';
  label: string;
  disabled?: boolean;
}> {
  const { t } = useTranslation();
  return [
    { value: 'auto',   label: t('Auto') },
    { value: 'mp4',    label: t('MP4') },
    { value: 'mp4hls', label: t('MP4 HLS') },
    { value: 'mjpeg',  label: t('MJPEG (not served by the API)'), disabled: true },
  ];
}
