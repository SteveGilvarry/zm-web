import { useRef, type MouseEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Maximize2, Minus, Pencil, Plus } from 'lucide-react';
import { usePinchZoom } from '@/features/events/usePinchZoom';
import type { Zone } from '@/api/zones';
import type { Monitor } from '@/types';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { zoneColour, zonePixelPoints } from './zoneArea';
import { ZoneLiveView } from './ZoneLiveView';
import { resolveZonePlayer } from './useZonePlayer';

interface ZonesPictureProps {
  monitor: Monitor;
  frame: { width: number; height: number };
  zones: Zone[];
  /** Legacy `zones.js:16-18`: clicking a polygon opens that zone. */
  onZoneClick: (id: number) => void;
  /** Edit monitor needs Monitors edit; legacy hides nothing, the editor refuses. */
  canEditMonitor?: boolean;
}

/**
 * Legacy's zones-page stream (`getStreamHTML` with `zones => true`): the
 * camera with every zone drawn over it in its type's colour, and the three
 * hover buttons in the middle — full screen, open the watch page, edit the
 * monitor. Pan-zoom works as legacy's `zmPanZoom`: Shift+Click zooms in,
 * drag pans, Ctrl+Click zooms out and Ctrl+Shift+Click zooms all the way
 * out; pinch and double-click work too.
 */
export function ZonesPicture({ monitor, frame, zones, onZoneClick, canEditMonitor = true }: ZonesPictureProps) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Destructured up front: reading the result object in JSX counts as a
  // ref read during render (react-hooks/refs).
  const { ref: zoomRef, style: zoomStyle, zoomed, zoomIn, zoomOut, reset } = usePinchZoom<HTMLDivElement>();
  // Modifier clicks zoom instead of opening the zone under the pointer.
  const onClickCapture = (e: MouseEvent) => {
    if (!e.shiftKey && !e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey && e.ctrlKey) reset();
    else if (e.shiftKey) zoomIn();
    else zoomOut();
  };
  const overlayButton =
    'inline-flex items-center justify-center w-10 h-10 rounded bg-black/60 text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white';

  return (
    <div
      ref={boxRef}
      dir="ltr"
      className="group relative bg-black w-full overflow-hidden"
      style={{ aspectRatio: frame.width > 0 && frame.height > 0 ? `${frame.width} / ${frame.height}` : '16 / 9' }}
      title={t('Shift+Click to Zoom, Click+Drag to Pan \nCtrl+Click to Zoom out, Ctrl+Shift+Click to Zoom out completely')}
      data-testid="zones-picture"
    >
      <div
        ref={zoomRef}
        className="absolute inset-0"
        style={zoomStyle}
        onClickCapture={onClickCapture}
        data-testid="zones-picture-zoom"
      >
      {/* The box already has the post-rotation aspect; the picture is
          turned onto it (rotated cameras included). */}
      {monitor.capturing !== 'None' ? (
        // Legacy streams with the monitor's own player here (no select on
        // this page); with no preference that is stills.
        <ZoneLiveView
          monitorId={monitor.id}
          player={resolveZonePlayer('', monitor.default_player)}
          frame={frame}
          orientation={monitor.orientation}
        />
      ) : (
        <MonitorPreview
          monitorId={monitor.id}
          monitorName={monitor.name}
          orientation={monitor.orientation}
          isActive={false}
          rotationFit="fill"
        />
      )}
      {frame.width > 0 && (
        <svg
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          aria-label={t('Zone outlines')}
          role="img"
        >
          {zones.map((z) => {
            const pts = zonePixelPoints(z, frame);
            const colour = zoneColour(z.type);
            return (
              <polygon
                key={z.id}
                points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={colour}
                fillOpacity={0.25}
                stroke={colour}
                strokeWidth={Math.max(2, frame.width / 400)}
                // Not focusable: the table's name link is the keyboard route
                // to the same editor.
                onClick={() => onZoneClick(z.id)}
                style={{ cursor: 'pointer' }}
                data-testid={`zone-polygon-${z.id}`}
              >
                <title>{z.name}</title>
              </polygon>
            );
          })}
        </svg>
      )}
      </div>
      {zoomed && (
        <div className="absolute top-2 end-2 flex gap-1">
          <button type="button" className={overlayButton} title={t('Zoom IN')} aria-label={t('Zoom IN')} onClick={zoomIn}>
            <Plus size={20} aria-hidden />
          </button>
          <button type="button" className={overlayButton} title={t('Zoom OUT')} aria-label={t('Zoom OUT')} onClick={zoomOut}>
            <Minus size={20} aria-hidden />
          </button>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">
        <button
          type="button"
          className={`${overlayButton} pointer-events-auto`}
          title={t('Open full screen')}
          aria-label={t('Open full screen')}
          onClick={() => { void boxRef.current?.requestFullscreen?.(); }}
        >
          <Maximize2 size={20} aria-hidden />
        </button>
        <Link
          to="/monitors/$monitorId"
          params={{ monitorId: String(monitor.id) }}
          className={`${overlayButton} pointer-events-auto`}
          title={t('Open watch page')}
          aria-label={t('Open watch page')}
        >
          <ExternalLink size={20} aria-hidden />
        </Link>
        {canEditMonitor && (
          <Link
            to="/monitors/$monitorId"
            params={{ monitorId: String(monitor.id) }}
            search={{ edit: true }}
            className={`${overlayButton} pointer-events-auto`}
            title={t('Edit monitor')}
            aria-label={t('Edit monitor')}
          >
            <Pencil size={20} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
