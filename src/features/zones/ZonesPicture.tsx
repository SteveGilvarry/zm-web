import { useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Maximize2, Pencil } from 'lucide-react';
import type { Zone } from '@/api/zones';
import type { Monitor } from '@/types';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { zoneColour, zonePixelPoints } from './zoneArea';

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
 * monitor.
 */
export function ZonesPicture({ monitor, frame, zones, onZoneClick, canEditMonitor = true }: ZonesPictureProps) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const overlayButton =
    'inline-flex items-center justify-center w-10 h-10 rounded bg-black/60 text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white';

  return (
    <div
      ref={boxRef}
      dir="ltr"
      className="group relative bg-black w-full"
      style={{ aspectRatio: frame.width > 0 && frame.height > 0 ? `${frame.width} / ${frame.height}` : '16 / 9' }}
      data-testid="zones-picture"
    >
      {/* The box already has the post-rotation aspect, so the snapshot
          fills it (rotated cameras included). */}
      <MonitorPreview
        monitorId={monitor.id}
        monitorName={monitor.name}
        orientation={monitor.orientation}
        isActive={monitor.capturing !== 'None'}
        rotationFit="fill"
      />
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
