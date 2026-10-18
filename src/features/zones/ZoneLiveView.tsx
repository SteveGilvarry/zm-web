import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefreshingSnapshot } from '@/hooks/useRefreshingSnapshot';
import { useWebRtcStream } from '@/hooks/useWebRtcStream';
import { useHlsStream } from '@/hooks/useHlsStream';
import type { ZonePlayerResolved } from './useZonePlayer';

interface ZoneLiveViewProps {
  monitorId: number;
  player: ZonePlayerResolved;
  /** A still image the operator loaded for the object-size tool; wins over the stream. */
  stillUrl?: string | null;
}

/**
 * The picture behind the zone polygon: the chosen player, or a still the
 * operator loaded to measure against. Fills its (aspect-ratio) parent.
 */
export function ZoneLiveView({ monitorId, player, stillUrl }: ZoneLiveViewProps) {
  const { t } = useTranslation();
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
  if (player === 'stills') return <ZoneSnapshot monitorId={monitorId} />;
  return <ZoneVideo monitorId={monitorId} protocol={player} />;
}

function ZoneSnapshot({ monitorId }: { monitorId: number }) {
  const { t } = useTranslation();
  const url = useRefreshingSnapshot(monitorId, true);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={t('Monitor snapshot')}
      className="absolute inset-0 w-full h-full object-fill pointer-events-none"
    />
  );
}

/**
 * Both stream hooks stay mounted, as on the watch page; only the chosen one
 * is started, and leaving (or switching) releases it without tearing down a
 * stream another view shares.
 */
function ZoneVideo({ monitorId, protocol }: { monitorId: number; protocol: 'webrtc' | 'hls' }) {
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
      className="absolute inset-0 w-full h-full object-fill pointer-events-none bg-black"
      data-testid={`zone-video-${protocol}`}
    />
  );
}
