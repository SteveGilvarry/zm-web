import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Maximize, Minus, Pencil, Plus, SquareArrowOutUpRight } from 'lucide-react';
import { usePerms } from '@/features/auth/usePerms';
import { PINCH_MAX, PINCH_MIN } from './usePinchZoom';

export interface PlayerOverlayControlsProps {
  monitorId: number;
  /** Current pinch/click zoom, so the buttons stop at the ends of the range. */
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFullscreen: () => void;
}

const btn =
  'inline-flex items-center justify-center w-8 h-8 rounded-sm bg-black/60 text-white hover:bg-black/80 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * The event player's `#button_zoom<mid>` block (`event.php` P:340–349): zoom
 * in / out, open full screen, open the monitor's watch page and — with edit
 * rights — its editor. Revealed on hover, so it stays out of the picture
 * while the operator is watching; the parent carries Tailwind's `group`.
 */
export function PlayerOverlayControls({
  monitorId, scale, onZoomIn, onZoomOut, onFullscreen,
}: PlayerOverlayControlsProps) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const id = String(monitorId);
  return (
    <div
      data-testid="player-overlay-controls"
      className="absolute inset-x-0 top-0 z-20 flex justify-center gap-1 p-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
    >
      <button type="button" className={btn} onClick={onZoomIn} disabled={scale >= PINCH_MAX} aria-label={t('Zoom IN')} title={t('Zoom IN')}>
        <Plus size={16} aria-hidden />
      </button>
      <button type="button" className={btn} onClick={onZoomOut} disabled={scale <= PINCH_MIN} aria-label={t('Zoom OUT')} title={t('Zoom OUT')}>
        <Minus size={16} aria-hidden />
      </button>
      <button type="button" className={btn} onClick={onFullscreen} aria-label={t('Open full screen')} title={t('Open full screen')}>
        <Maximize size={16} aria-hidden />
      </button>
      <Link to="/monitors/$monitorId" params={{ monitorId: id }} className={btn} aria-label={t('Open watch page')} title={t('Open watch page')}>
        <SquareArrowOutUpRight size={16} aria-hidden />
      </Link>
      {can('monitors', 'Edit') && (
        <Link to="/monitors/$monitorId" params={{ monitorId: id }} search={{ edit: true }} className={btn} aria-label={t('Edit monitor')} title={t('Edit monitor')}>
          <Pencil size={16} aria-hidden />
        </Link>
      )}
    </div>
  );
}
