import { useState, useRef, useCallback, useEffect } from 'react';
import Hls from 'hls.js';
import { useTranslation } from 'react-i18next';
import { startLiveStream, getHlsPlaylistUrl } from '@/api/monitors';
import { getAuthToken } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { StreamConnectionState } from '@/types';
import type { StreamHookResult } from '@/hooks/useWebRtcStream';

export type { StreamHookResult } from '@/hooks/useWebRtcStream';

export const HLS_TIMING = {
  /** Give the transcoder time to write its first segment before loading. */
  STARTUP_DELAY_MS: 2_000,
  MAX_NETWORK_RETRIES: 5,
  BASE_RETRY_DELAY_MS: 1_000,
  MAX_RETRY_DELAY_MS: 16_000,
} as const;

/**
 * One client's HLS playback of a monitor's live stream.
 *
 * Unlike WebRTC there is nothing to share between consumers — every hls.js
 * instance pulls the same playlist — so the hook owns its instance outright.
 * What it never does is `DELETE /live/{id}/stop`: the backend session is
 * shared by every viewer of the monitor, and stopping it here would kill
 * their playback too. Dropping the player is all one client needs to do.
 */
export function useHlsStream(monitorId: number): StreamHookResult {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const startupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecoveryAttempts = useRef(0);
  const networkRetries = useRef(0);
  /** Undo for the Safari native path: listeners + token subscription. */
  const nativeCleanup = useRef<(() => void) | null>(null);
  // Mirror of `state` for handlers, so `start` keeps one identity and the
  // guard never reads a stale closure.
  const stateRef = useRef<StreamConnectionState>('idle');
  const [state, setStateRaw] = useState<StreamConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  const setState = useCallback((next: StreamConnectionState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  const destroyPlayer = useCallback(() => {
    if (startupTimer.current) {
      clearTimeout(startupTimer.current);
      startupTimer.current = null;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (nativeCleanup.current) {
      nativeCleanup.current();
      nativeCleanup.current = null;
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
    destroyPlayer();
    setState('idle');
    setError(null);
    setHasAudio(false);
  }, [destroyPlayer, setState]);

  const start = useCallback(() => {
    // Anything but idle/failed already owns a player; a second start would
    // build a second Hls and leak the first.
    if (stateRef.current !== 'idle' && stateRef.current !== 'failed') return;

    destroyPlayer();
    setError(null);
    setState('connecting');
    mediaRecoveryAttempts.current = 0;
    networkRetries.current = 0;

    startLiveStream(monitorId, { enable_hls: true })
      .then(() => {
        // stop() may have run while /start was in flight.
        if (stateRef.current !== 'connecting') return;
        if (!videoRef.current) {
          setState('failed');
          setError(t('Video element not available'));
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
            // hls.js fetches them via XHR, so attach the header here. The
            // token is read per request, so rotation mid-stream is fine.
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
            if (!data.fatal) return;
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: {
                networkRetries.current += 1;
                const attempt = networkRetries.current;
                if (attempt > HLS_TIMING.MAX_NETWORK_RETRIES) {
                  setState('failed');
                  setError(t('Network error - gave up after {{count}} retries', {
                    count: HLS_TIMING.MAX_NETWORK_RETRIES,
                  }));
                  destroyPlayer();
                  break;
                }
                setError(t('Network error - retrying ({{attempt}}/{{max}})...', {
                  attempt,
                  max: HLS_TIMING.MAX_NETWORK_RETRIES,
                }));
                const delay = Math.min(
                  HLS_TIMING.BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
                  HLS_TIMING.MAX_RETRY_DELAY_MS,
                );
                if (retryTimer.current) clearTimeout(retryTimer.current);
                retryTimer.current = setTimeout(() => {
                  retryTimer.current = null;
                  if (hlsRef.current === hls) hls.startLoad();
                }, delay);
                break;
              }
              case Hls.ErrorTypes.MEDIA_ERROR:
                mediaRecoveryAttempts.current++;
                if (mediaRecoveryAttempts.current === 1) {
                  setError(t('Media error - recovering...'));
                  hls.recoverMediaError();
                } else if (mediaRecoveryAttempts.current === 2) {
                  setError(t('Media error - switching codec...'));
                  hls.swapAudioCodec();
                  hls.recoverMediaError();
                } else {
                  setState('failed');
                  setError(t('Media playback failed'));
                  destroyPlayer();
                }
                break;
              default:
                setState('failed');
                setError(t('Fatal stream error'));
                destroyPlayer();
                break;
            }
          });

          // Once data is buffered, ensure video is playing and clear errors
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            mediaRecoveryAttempts.current = 0;
            networkRetries.current = 0;
            setError((prev) => prev ? null : prev);
            if (videoRef.current?.paused) {
              videoRef.current.play().catch(() => {});
            }
          });

          hlsRef.current = hls;

          startupTimer.current = setTimeout(() => {
            startupTimer.current = null;
            hls.loadSource(playlistUrl);
          }, HLS_TIMING.STARTUP_DELAY_MS);
        } else if (videoRef.current!.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS. <video> src cannot send headers, so the JWT
          // rides in ?token=; when the store rotates the token we point the
          // element at the new URL so playback outlives the old token.
          const video = videoRef.current!;
          const onLoaded = () => {
            setState('connected');
            setHasAudio(true);
            video.play().catch(() => {});
          };
          const onError = () => {
            setState('failed');
            setError(t('Stream playback error'));
          };
          const applySrc = () => {
            video.src = getHlsPlaylistUrl(monitorId, true);
          };
          let unsubscribeToken: (() => void) | null = null;
          nativeCleanup.current = () => {
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('error', onError);
            unsubscribeToken?.();
          };
          startupTimer.current = setTimeout(() => {
            startupTimer.current = null;
            video.addEventListener('loadedmetadata', onLoaded);
            video.addEventListener('error', onError);
            applySrc();
            unsubscribeToken = useAuthStore.subscribe((s, prev) => {
              if (s.accessToken && s.accessToken !== prev.accessToken) applySrc();
            });
          }, HLS_TIMING.STARTUP_DELAY_MS);
        } else {
          setState('failed');
          setError(t('HLS not supported in this browser'));
        }
      })
      .catch((err) => {
        if (stateRef.current !== 'connecting') return;
        setState('failed');
        setError(err instanceof Error ? err.message : t('Failed to start HLS stream'));
      });
  }, [monitorId, destroyPlayer, setState, t]);

  // Drop the player on unmount. No DELETE /stop — see the header comment.
  useEffect(() => destroyPlayer, [destroyPlayer]);

  return { videoRef, state, error, start, stop, pause: stop, hasAudio };
}
