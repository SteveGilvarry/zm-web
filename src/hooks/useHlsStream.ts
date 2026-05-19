import { useState, useRef, useCallback, useEffect } from 'react';
import Hls from 'hls.js';
import { startLiveStream, stopLiveStream, getHlsPlaylistUrl } from '@/api/monitors';
import { getAuthToken } from '@/api/client';
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
  const loadDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecoveryAttempts = useRef(0);
  const [state, setState] = useState<StreamConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  const destroyHls = useCallback(() => {
    if (loadDelayRef.current) {
      clearTimeout(loadDelayRef.current);
      loadDelayRef.current = null;
    }
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
    mediaRecoveryAttempts.current = 0;

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
            // Tolerate initially empty playlists while transcoder produces first segment
            levelLoadingMaxRetry: 10,
            levelLoadingRetryDelay: 1000,
            // HLS playlist + segment endpoints require a Bearer token.
            // hls.js fetches them via XHR, so attach the header here.
            xhrSetup: (xhr) => {
              const token = getAuthToken();
              if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
          });

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
                  mediaRecoveryAttempts.current++;
                  if (mediaRecoveryAttempts.current === 1) {
                    setError('Media error - recovering...');
                    hls.recoverMediaError();
                  } else if (mediaRecoveryAttempts.current === 2) {
                    setError('Media error - switching codec...');
                    hls.swapAudioCodec();
                    hls.recoverMediaError();
                  } else {
                    setState('failed');
                    setError('Media playback failed');
                    destroyHls();
                  }
                  break;
                default:
                  setState('failed');
                  setError('Fatal stream error');
                  destroyHls();
                  break;
              }
            }
          });

          // Once data is buffered, ensure video is playing and clear errors
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            mediaRecoveryAttempts.current = 0;
            setError((prev) => prev ? null : prev);
            if (videoRef.current?.paused) {
              videoRef.current.play().catch(() => {});
            }
          });

          hlsRef.current = hls;

          // Delay source loading to give transcoder time to produce first segment
          loadDelayRef.current = setTimeout(() => {
            loadDelayRef.current = null;
            hls.loadSource(playlistUrl);
          }, 2000);
        } else if (videoRef.current!.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS — also delay for transcoder startup.
          // <video> src cannot send headers, so authenticate via ?token=.
          const nativeUrl = getHlsPlaylistUrl(monitorId, true);
          setTimeout(() => {
            videoRef.current!.src = nativeUrl;
            videoRef.current!.addEventListener('loadedmetadata', () => {
              setState('connected');
              setHasAudio(true);
              videoRef.current?.play().catch(() => {});
            }, { once: true });
            videoRef.current!.addEventListener('error', () => {
              setState('failed');
              setError('Stream playback error');
            }, { once: true });
          }, 2000);
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
