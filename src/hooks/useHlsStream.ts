import { useState, useRef, useCallback, useEffect } from 'react';
import Hls from 'hls.js';
import { startLiveStream, stopLiveStream, getHlsPlaylistUrl } from '@/api/monitors';
import type { StreamConnectionState } from '@/types';

export interface StreamHookResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: StreamConnectionState;
  error: string | null;
  start: () => void;
  stop: () => void;
  hasAudio: boolean;
}

export function useHlsStream(monitorId: number): StreamHookResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<StreamConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute('src');
    }
  }, []);

  const stop = useCallback(() => {
    destroyHls();
    setState('idle');
    setError(null);
    setHasAudio(false);
    stopLiveStream(monitorId).catch(() => {
      // Best-effort cleanup
    });
  }, [monitorId, destroyHls]);

  const start = useCallback(() => {
    if (state === 'connecting' || state === 'signaling') return;

    setError(null);
    setState('connecting');

    startLiveStream(monitorId, { enable_hls: true })
      .then(() => {
        if (!videoRef.current) {
          setState('failed');
          setError('Video element not available');
          return;
        }

        const playlistUrl = getHlsPlaylistUrl(monitorId);

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            liveSyncDuration: 3,
            liveMaxLatencyDuration: 10,
            liveDurationInfinity: true,
            backBufferLength: 30,
          });

          hls.loadSource(playlistUrl);
          hls.attachMedia(videoRef.current!);

          hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
            setState('connected');
            setHasAudio(data.levels.some((level) => level.audioCodec));
            videoRef.current?.play().catch(() => {});
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  setError('Network error - retrying...');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  setError('Media error - recovering...');
                  hls.recoverMediaError();
                  videoRef.current?.play().catch(() => {});
                  break;
                default:
                  setState('failed');
                  setError('Fatal stream error');
                  destroyHls();
                  break;
              }
            }
          });

          // Clear non-fatal error toast once playback resumes
          hls.on(Hls.Events.FRAG_LOADED, () => {
            if (error) setError(null);
          });

          hlsRef.current = hls;
        } else if (videoRef.current!.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          videoRef.current!.src = playlistUrl;
          videoRef.current!.addEventListener('loadedmetadata', () => {
            setState('connected');
            setHasAudio(true); // Assume audio present for native HLS
            videoRef.current?.play().catch(() => {});
          }, { once: true });
          videoRef.current!.addEventListener('error', () => {
            setState('failed');
            setError('Stream playback error');
          }, { once: true });
        } else {
          setState('failed');
          setError('HLS not supported in this browser');
        }
      })
      .catch((err) => {
        setState('failed');
        setError(err instanceof Error ? err.message : 'Failed to start HLS stream');
      });
  }, [monitorId, state, destroyHls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyHls();
      stopLiveStream(monitorId).catch(() => {});
    };
  }, [monitorId, destroyHls]);

  return { videoRef, state, error, start, stop, hasAudio };
}
