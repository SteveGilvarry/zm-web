import { useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { getOrientationStyle, isOrientationRotated } from '@/types';
import { stageVideoStyle } from '@/features/monitors/orientation';
import { useRefreshingSnapshot } from '@/hooks/useRefreshingSnapshot';
import { useWebRtcStream } from '@/hooks/useWebRtcStream';
import { useHlsStream } from '@/hooks/useHlsStream';
import type { ZonePlayerResolved } from './useZonePlayer';

interface ZoneLiveViewProps {
  monitorId: number;
  player: ZonePlayerResolved;
  /** A still image the operator loaded for the object-size tool; wins over the stream. */
  stillUrl?: string | null;
  /** The view frame (rotation applied), which the parent box already has the shape of. */
  frame: { width: number; height: number };
  /** The monitor's Orientation: snapshots and streams arrive unrotated. */
  orientation?: string | null;
}

/**
 * Class and style that land an unrotated camera image on the view frame.
 * A 90°/270° camera is laid out at the swapped size and turned back onto
 * the box (`stageVideoStyle`); flips and 180° are a plain transform.
 */
function mediaLayout(frame: { width: number; height: number }, orientation: string | null | undefined): {
  className: string;
  style: CSSProperties | undefined;
} {
  if (isOrientationRotated(orientation)) {
    // Native size is the view frame swapped back.
    return {
      className: 'object-fill pointer-events-none',
      style: stageVideoStyle({ width: frame.height, height: frame.width, orientation }),
    };
  }
  return {
    className: 'absolute inset-0 w-full h-full object-fill pointer-events-none',
    style: getOrientationStyle(orientation),
  };
}

/**
 * The picture behind the zone polygon: the chosen player, or a still the
 * operator loaded to measure against. Fills its (aspect-ratio) parent.
 */
export function ZoneLiveView({ monitorId, player, stillUrl, frame, orientation }: ZoneLiveViewProps) {
  const { t } = useTranslation();
  const layout = mediaLayout(frame, orientation);
  // A loaded still is whatever the operator chose, shown as it is.
  if (stillUrl) {
    return (
      <img
        src={stillUrl}
        alt={t('Still image')}
        className="absolute inset-0 w-full h-full object-fill pointer-events-none"
        data-testid="zone-still"
      />
    );
  }
  if (player === 'stills') return <ZoneSnapshot monitorId={monitorId} layout={layout} />;
  return <ZoneVideo monitorId={monitorId} protocol={player} layout={layout} />;
}

type MediaLayout = ReturnType<typeof mediaLayout>;

function ZoneSnapshot({ monitorId, layout }: { monitorId: number; layout: MediaLayout }) {
  const { t } = useTranslation();
  const url = useRefreshingSnapshot(monitorId, true);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={t('Monitor snapshot')}
      className={layout.className}
      style={layout.style}
    />
  );
}

/**
 * Both stream hooks stay mounted, as on the watch page; only the chosen one
 * is started, and leaving (or switching) releases it without tearing down a
 * stream another view shares.
 */
function ZoneVideo({ monitorId, protocol, layout }: { monitorId: number; protocol: 'webrtc' | 'hls'; layout: MediaLayout }) {
  const webrtc = useWebRtcStream(monitorId);
  const hls = useHlsStream(monitorId);
  const active = protocol === 'webrtc' ? webrtc : hls;
  const idle = protocol === 'webrtc' ? hls : webrtc;
  // Pulled out up front: reading `active.videoRef` in JSX counts as a ref
  // read during render (react-hooks/refs).
  const { videoRef, start, pause } = active;
  const { pause: pauseIdle } = idle;

  useEffect(() => {
    pauseIdle();
    start();
    return () => pause();
  }, [start, pause, pauseIdle]);

  return (
    <video
      ref={videoRef}
      muted
      autoPlay
      playsInline
      className={`${layout.className} bg-black`}
      style={layout.style}
      data-testid={`zone-video-${protocol}`}
    />
  );
}
