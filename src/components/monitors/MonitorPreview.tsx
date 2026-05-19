import { useRef, useState, useEffect } from 'react';
import { Video, VideoOff } from 'lucide-react';
import { StreamCell } from '@/components/common/StreamCell';
import { useInViewport } from '@/hooks/useInViewport';
import { useRefreshingSnapshot } from '@/hooks/useRefreshingSnapshot';
import { getOrientationStyle } from '@/types';

/** How long the pointer must rest on a card before its live preview starts —
 *  long enough that sweeping the mouse across a grid costs nothing. */
const HOVER_INTENT_MS = 400;

interface MonitorPreviewProps {
  monitorId: number;
  monitorName: string;
  orientation?: string | null;
  /** capturing !== 'None' — a disabled monitor has nothing to show. */
  isActive: boolean;
  /** Enable debounced hover-to-live WebRTC preview (grid view). */
  enableLivePreview?: boolean;
  compact?: boolean;
}

/**
 * The thumbnail area of a monitor card. Renders a viewport-bounded refreshing
 * snapshot and, in grid view, upgrades to a live WebRTC stream while the
 * pointer rests on the card. Designed so total cost scales with the viewport,
 * never with the number of monitors:
 *  - snapshots refresh only while the card is on screen and the tab is visible
 *  - at most one card is live at a time (one pointer), and a hover-intent
 *    delay keeps mouse sweeps from starting streams
 *
 * Fill an `aspect-video` / sized, `position: relative` parent — this renders
 * absolutely within it.
 */
export function MonitorPreview({
  monitorId,
  monitorName,
  orientation,
  isActive,
  enableLivePreview = false,
  compact = false,
}: MonitorPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInViewport(rootRef, '200px');
  const snapshotUrl = useRefreshingSnapshot(monitorId, isActive && inView);

  const [live, setLive] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canPreview = enableLivePreview && isActive;

  const beginHover = () => {
    if (!canPreview) return;
    hoverTimer.current = setTimeout(() => setLive(true), HOVER_INTENT_MS);
  };
  const endHover = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setLive(false);
  };

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  const iconSize = compact ? 20 : 32;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 bg-abyss"
      onMouseEnter={beginHover}
      onMouseLeave={endHover}
    >
      {!isActive ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <VideoOff size={iconSize} className="text-text-dim" />
        </div>
      ) : (
        <>
          {/* Fallback icon — shown until a snapshot loads */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Video size={iconSize} className="text-text-dim" />
          </div>

          {/* Refreshing snapshot — base layer */}
          {snapshotUrl && (
            <img
              src={snapshotUrl}
              alt={monitorName}
              className="absolute inset-0 w-full h-full object-contain"
              style={getOrientationStyle(orientation)}
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          )}

          {/* Live WebRTC preview — overlays the snapshot while hovered */}
          {live && (
            <div className="absolute inset-0">
              <StreamCell
                protocol="webrtc"
                monitorId={monitorId}
                orientation={orientation}
                autoStart
                compact
              />
            </div>
          )}

          {!live && (
            <div className="absolute inset-0 scanlines pointer-events-none" />
          )}
        </>
      )}
    </div>
  );
}
