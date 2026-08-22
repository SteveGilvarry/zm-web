import { useRef, useState, useEffect } from 'react';
import { Video, VideoOff } from 'lucide-react';
import { StreamCell } from '@/components/common/StreamCell';
import { useInViewport } from '@/hooks/useInViewport';
import { useRefreshingSnapshot } from '@/hooks/useRefreshingSnapshot';
import { getOrientationStyle, isOrientationRotated } from '@/types';
import type { CSSProperties } from 'react';

/** Same swap-dimensions rotation strategy as StreamCell, applied to the
 *  refreshing snapshot so the still image fills a portrait container
 *  instead of getting letterboxed to a thumbnail-sized strip. */
function rotatedSnapshotStyle(orientation: string | null | undefined): CSSProperties {
  const deg = (orientation ?? '').replace(/[_\s]/g, '').toLowerCase() === 'rotate270' ? 270 : 90;
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '177.7778%',
    height: '56.25%',
    maxWidth: 'none',
    maxHeight: 'none',
    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
    transformOrigin: 'center',
    objectFit: 'cover',
  };
}

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
  /** See StreamCell. Default 'fit' (parent is fixed landscape, rotation
   *  letterboxes); 'fill' for parents with post-rotation aspect. */
  rotationFit?: 'fill' | 'fit';
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
  rotationFit = 'fit',
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
      dir="ltr"
      className="absolute inset-0 bg-bg-sunken"
      onMouseEnter={beginHover}
      onMouseLeave={endHover}
    >
      {!isActive ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <VideoOff size={iconSize} className="text-fg-faint" aria-hidden />
        </div>
      ) : (
        <>
          {/* Fallback icon — shown until a snapshot loads */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Video size={iconSize} className="text-fg-faint" aria-hidden />
          </div>

          {/* Refreshing snapshot — base layer. Rotated cameras switch
              strategy on rotationFit: 'fill' for parents whose aspect
              matches the post-rotation shape, 'fit' for fixed landscape
              parents (simple rotate+scale, letterboxed). */}
          {snapshotUrl && (
            <img
              src={snapshotUrl}
              alt={monitorName}
              className={
                isOrientationRotated(orientation) && rotationFit === 'fill'
                  ? 'bg-black'
                  : 'absolute inset-0 w-full h-full object-contain'
              }
              style={
                isOrientationRotated(orientation) && rotationFit === 'fill'
                  ? rotatedSnapshotStyle(orientation)
                  : getOrientationStyle(orientation)
              }
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          )}

          {/* Live WebRTC preview — overlays the snapshot while hovered.
              rotationFit is forwarded so the live overlay matches the
              snapshot's rotation strategy. */}
          {live && (
            <div className="absolute inset-0">
              <StreamCell
                protocol="webrtc"
                monitorId={monitorId}
                orientation={orientation}
                autoStart
                compact
                rotationFit={rotationFit}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
