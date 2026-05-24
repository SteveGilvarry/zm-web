import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { CSSProperties } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useWebRtcStream } from '@/hooks/useWebRtcStream';
import { useHlsStream } from '@/hooks/useHlsStream';
import type { StreamProtocol } from '@/types';
import { getOrientationStyle, isOrientationRotated } from '@/types';
import type { StreamHookResult } from '@/hooks/useWebRtcStream';

/**
 * Style for a rotated live stream. Live feeds come from the camera in their
 * raw orientation (landscape), so a ROTATE_90 monitor needs the displayed
 * element rotated 90° to fill its post-rotation (portrait) container.
 *
 * The math: parent container has aspectRatio matching the post-rotation
 * shape (e.g. 9:16 for ROTATE_90 of a 16:9 sensor). To fill that portrait
 * box with a rotated landscape video, the underlying <video> element needs
 * to be sized to a *landscape* shape whose dimensions, when rotated 90°,
 * exactly fit the container:
 *
 *   element width  = container_height  (in percentage of container_width)
 *   element height = container_width   (in percentage of container_height)
 *
 * Container's aspect is W:H where (W < H) for portrait. So:
 *   width-pct  = (H / W) * 100   → > 100%, element wider than container
 *   height-pct = (W / H) * 100   → < 100%, element shorter than container
 *
 * After translate(-50%, -50%) rotate(90°) the element's footprint becomes
 * W × H — exactly the container shape, no letterboxing.
 */
function rotatedStreamStyle(rotationDeg: 90 | 270): CSSProperties {
  // Without runtime measurement we assume the parent's aspect is the
  // post-rotation shape (it is, in every call site we have today).
  // The element gets the SWAPPED aspect inline via percentages, scaled
  // relative to the container, then rotated to land back on the container.
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    // For an unknown container aspect we can't compute exact percentages,
    // so fall back to a 16:9 element rotated to fill a 9:16 container.
    // This matches every camera in this codebase (all 16:9 sensors).
    width: '177.7778%',
    height: '56.25%',
    maxWidth: 'none',
    maxHeight: 'none',
    transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
    transformOrigin: 'center',
  };
}

interface StreamCellProps {
  protocol: StreamProtocol;
  monitorId: number;
  monitorName?: string;
  orientation?: string | null;
  autoStart?: boolean;
  compact?: boolean;
  showControls?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  /**
   * Rotation strategy for rotated cameras:
   *  - 'auto' (default): measure the container's actual aspect at
   *    runtime via ResizeObserver and pick 'fill' when the container
   *    is portrait-shaped (matches the camera's post-rotation aspect),
   *    'fit' when it isn't. Lets operators drag dividers to coax a
   *    portrait camera into filling its cell without cropping.
   *  - 'fill': always swap-dimensions + rotate, assuming the parent's
   *    aspect matches the post-rotation shape. Use when you know the
   *    container is purpose-built around the camera.
   *  - 'fit': always rotate + scale(9/16), letterboxed inside a
   *    landscape container. Use when the container is constrained to
   *    a different aspect than the camera.
   */
  rotationFit?: 'auto' | 'fill' | 'fit';
}

export function StreamCell({
  protocol,
  monitorId,
  monitorName,
  orientation,
  autoStart = false,
  compact = false,
  showControls = false,
  onClick,
  onDoubleClick,
  rotationFit = 'auto',
}: StreamCellProps) {
  // Conditionally render inner component based on protocol.
  // When protocol changes, React unmounts the old and mounts the new,
  // triggering hook cleanup (closing connections).
  if (protocol === 'webrtc') {
    return (
      <WebRtcStreamInner
        monitorId={monitorId}
        monitorName={monitorName}
        orientation={orientation}
        autoStart={autoStart}
        compact={compact}
        showControls={showControls}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        rotationFit={rotationFit}
      />
    );
  }
  return (
    <HlsStreamInner
      monitorId={monitorId}
      monitorName={monitorName}
      orientation={orientation}
      autoStart={autoStart}
      compact={compact}
      showControls={showControls}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      rotationFit={rotationFit}
    />
  );
}

interface StreamInnerProps {
  monitorId: number;
  monitorName?: string;
  orientation?: string | null;
  autoStart: boolean;
  compact: boolean;
  showControls: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  rotationFit: 'auto' | 'fill' | 'fit';
}

function WebRtcStreamInner(props: StreamInnerProps) {
  const stream = useWebRtcStream(props.monitorId);
  return <StreamVideo stream={stream} protocol="webrtc" {...props} />;
}

function HlsStreamInner(props: StreamInnerProps) {
  const stream = useHlsStream(props.monitorId);
  return <StreamVideo stream={stream} protocol="hls" {...props} />;
}

interface StreamVideoProps extends StreamInnerProps {
  stream: StreamHookResult;
  protocol: StreamProtocol;
}

function StreamVideo({
  stream,
  protocol,
  monitorName,
  orientation,
  autoStart,
  compact,
  showControls,
  onClick,
  onDoubleClick,
  rotationFit,
}: StreamVideoProps) {
  const isConnecting = stream.state === 'connecting' || stream.state === 'signaling';
  const isConnected = stream.state === 'connected';
  const isFailed = stream.state === 'failed';
  const isIdle = stream.state === 'idle';

  useEffect(() => {
    if (!autoStart) return;
    // Small delay to stagger many simultaneous connections (console/montage).
    // start() is reference-counted and idempotent per hook instance, so it is
    // safe to call even when the shared stream is already running.
    const timer = setTimeout(() => {
      stream.start();
    }, 100 + Math.random() * 500);
    return () => clearTimeout(timer);
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    stream.stop();
    setTimeout(() => stream.start(), 200);
  };

  // Auto-resolve fit/fill from the container's actual aspect.
  // Cell aspect < 1 (portrait) → camera's post-rotation matches → fill.
  // Cell aspect >= 1 (landscape/square) → letterbox via 'fit'.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerIsPortrait, setContainerIsPortrait] = useState(false);
  useEffect(() => {
    if (rotationFit !== 'auto') return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setContainerIsPortrait(r.height > r.width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rotationFit]);

  const effectiveFit: 'fill' | 'fit' =
    rotationFit === 'auto' ? (containerIsPortrait ? 'fill' : 'fit') : rotationFit;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-abyss overflow-hidden"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Video element — always rendered so ref is available.
          Rotated cameras pick between two strategies via rotationFit:
            - 'fill' for parents whose aspect matches the post-rotation
              shape (Console / Monitors thumbnails). Uses swap-dimensions
              so the rotated content fills the container.
            - 'fit' for fixed landscape parents (Montage cells). Uses
              the simple rotate + scale(0.5625) so the rotated content
              shrinks to fit a 16:9 box with letterboxing on either side.
              Avoids the cropping we got from swap-dimensions in a
              non-matching container. */}
      <video
        ref={stream.videoRef}
        className={clsx(
          isOrientationRotated(orientation) && effectiveFit === 'fill'
            ? 'object-contain bg-black'
            : 'w-full h-full object-contain bg-black',
          isIdle && 'hidden',
        )}
        style={
          isOrientationRotated(orientation) && effectiveFit === 'fill'
            ? rotatedStreamStyle(
                (orientation ?? '').replace(/[_\s]/g, '').toLowerCase() === 'rotate270'
                  ? 270
                  : 90,
              )
            : getOrientationStyle(orientation)
        }
        autoPlay
        muted
        playsInline
      />

      {/* Idle state */}
      {isIdle && !autoStart && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-text-dim text-xs font-mono">OFFLINE</div>
        </div>
      )}

      {/* Connecting overlay */}
      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <Loader2
              size={compact ? 20 : 32}
              className="mx-auto text-cyan animate-spin"
            />
            {!compact && (
              <p className="text-xs text-text-muted mt-2">
                {stream.state === 'signaling' ? 'Negotiating...' : 'Connecting...'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Failed overlay */}
      {isFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <AlertTriangle size={compact ? 16 : 24} className="mx-auto text-amber mb-1" />
            {!compact && (
              <p className="text-xs text-text-muted mb-2 max-w-[200px] mx-auto">
                {stream.error || 'Stream failed'}
              </p>
            )}
            <button
              onClick={handleRetry}
              className={clsx(
                'flex items-center gap-1 mx-auto rounded',
                'text-xs font-medium text-cyan hover:text-cyan-dim transition-colors',
                compact ? 'px-2 py-1' : 'px-3 py-1.5 bg-surface/50',
              )}
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* LIVE badge */}
      {isConnected && (
        <div
          className={clsx(
            'absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60',
            compact && 'top-1 left-1',
          )}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-crimson" />
          </span>
          <span className="text-[10px] font-mono font-bold text-white">
            LIVE
          </span>
          {!compact && (
            <span className="text-[10px] font-mono text-text-muted">
              &middot; {protocol === 'webrtc' ? 'WebRTC' : 'HLS'}
            </span>
          )}
        </div>
      )}

      {/* Monitor name overlay */}
      {monitorName && !compact && (
        <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <span className="text-xs font-medium text-white truncate block">
            {monitorName}
          </span>
        </div>
      )}

      {/* Controls overlay */}
      {showControls && isConnected && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              stream.stop();
            }}
            className="p-1 rounded bg-black/60 text-text-muted hover:text-crimson transition-colors"
          >
            <span className="text-[10px] font-mono font-bold">STOP</span>
          </button>
        </div>
      )}

      {/* Non-fatal error toast */}
      {stream.error && !isFailed && (
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber/90 text-void text-[10px] font-medium">
            <AlertTriangle size={10} />
            {stream.error}
          </div>
        </div>
      )}

      {/* Scanlines */}
      <div className="absolute inset-0 scanlines pointer-events-none" />
    </div>
  );
}
