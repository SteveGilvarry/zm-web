import type { RefObject } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Maximize, Minus, Pencil, Plus, SquareArrowOutUpRight } from 'lucide-react';
import { usePerms } from '@/features/auth/usePerms';
import { toggleFullscreen } from './fullscreen';
import { TILE_ZOOM_MAX, type TileZoom } from './tileZoom';

export interface TileControlsProps {
  monitorId: number;
  /** The element the fullscreen button expands (legacy `#monitor<id>`). */
  targetRef: RefObject<HTMLElement | null>;
  zoom: TileZoom;
}

const btn =
  'inline-flex items-center justify-center w-8 h-8 rounded-sm bg-black/60 text-white hover:bg-black/80 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Legacy `getStreamHTML`'s `#button_zoom<id>` block: zoom in / out, open
 * full screen, open the watch page and (with monitor edit rights) the
 * monitor editor. Shown while the pointer is over the tile — the parent
 * carries Tailwind's `group` class.
 */
export function TileControls({ monitorId, targetRef, zoom }: TileControlsProps) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const id = String(monitorId);
  return (
    <div
      data-testid={`tile-controls-${monitorId}`}
      className="absolute inset-x-0 top-0 z-20 flex justify-center gap-1 p-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
    >
      <button type="button" className={btn} onClick={zoom.zoomIn} disabled={zoom.zoom >= TILE_ZOOM_MAX} aria-label={t('Zoom IN')} title={t('Zoom IN')}>
        <Plus size={16} aria-hidden />
      </button>
      <button type="button" className={btn} onClick={zoom.zoomOut} disabled={zoom.zoom <= 1} aria-label={t('Zoom OUT')} title={t('Zoom OUT')}>
        <Minus size={16} aria-hidden />
      </button>
      <button type="button" className={btn} onClick={() => toggleFullscreen(targetRef.current)} aria-label={t('Open full screen')} title={t('Open full screen')}>
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
