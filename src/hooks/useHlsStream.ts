import { useState, useRef, useCallback, useEffect } from 'react';
import Hls from 'hls.js';
import { useTranslation } from 'react-i18next';
import { startLiveStream, getHlsPlaylistUrl } from '@/api/monitors';
import { classifyApiError, getAuthToken, reserveRateLimitSlot } from '@/api/client';
import { gatedLoader } from '@/streaming/gatedHlsLoader';
import { useAuthStore } from '@/stores/auth';
import type { StreamConnectionState } from '@/types';
import type { StreamHookResult } from '@/hooks/useWebRtcStream';

export type { StreamHookResult } from '@/hooks/useWebRtcStream';

/** Errors a later attempt can fix: the box said slow down, is down, or is unreachable. */
function isTransient(err: unknown): boolean {
  const kind = classifyApiError(err);
  return kind === 'rate_limited' || kind === 'network' || kind === 'server';
}

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
 *
 * What it must do is re-create the session on every network retry. zm-api
 * reaps a live session 90 s after its last playlist or segment fetch, after
 * which `live.m3u8` answers 404 until someone POSTs `/start` again, and
 * hls.js never retries a 4xx on its own. A retry that only called
 * `startLoad()` left a cell polling a dead playlist until it was remounted.
 * `/start` is idempotent (409 means the session is there), so the extra
 * POST costs one request per retry.
 *
 * hls.js also fetches with its own XHRs, outside the API client's 429 gate.
 * A 429 seen here closes that gate for the whole client and the retry waits
 * out `Retry-After`, so four cells cannot keep extending zm-api's penalty
 * by polling through it.
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

    /**
     * Make sure the backend session exists, then play. zm-api reaps a
     * session 90 s after its last playlist fetch, so this runs before every
     * (re)load, not only the first: a 409 means it is still there, a 200
     * that it was re-created. A transient failure of the POST is one more
     * network retry.
     */
    function attemptSession() {
      startLiveStream(monitorId, { enable_hls: true })
        .then(() => {
          // stop() may have run while /start was in flight.
          if (stateRef.current === 'idle' || stateRef.current === 'failed') return;
          if (hlsRef.current) hlsRef.current.startLoad();
          else buildPlayer();
        })
        .catch((err) => {
          if (stateRef.current === 'idle' || stateRef.current === 'failed') return;
          if (isTransient(err)) {
            scheduleNetworkRetry();
            return;
          }
          setState('failed');
          setError(err instanceof Error ? err.message : t('Failed to start HLS stream'));
          destroyPlayer();
        });
    }

    /** One more attempt at the network, with backoff, behind the 429 gate. */
    function scheduleNetworkRetry() {
      networkRetries.current += 1;
      const attempt = networkRetries.current;
      if (attempt > HLS_TIMING.MAX_NETWORK_RETRIES) {
        setState('failed');
        setError(t('Network error - gave up after {{count}} retries', {
          count: HLS_TIMING.MAX_NETWORK_RETRIES,
        }));
        destroyPlayer();
        return;
      }
      setError(t('Network error - retrying ({{attempt}}/{{max}})...', {
        attempt,
        max: HLS_TIMING.MAX_NETWORK_RETRIES,
      }));
      const backoff = Math.min(
        HLS_TIMING.BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
        HLS_TIMING.MAX_RETRY_DELAY_MS,
      );
      const delay = Math.max(backoff, reserveRateLimitSlot());
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        attemptSession();
      }, delay);
    }

    /** Build the hls.js player (or Safari's native one) once the session is up. */
    function buildPlayer() {
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
          // Playlist and segment fetches wait out the API client's 429 gate
          // and report their own 429s to it (see the module).
          loader: gatedLoader(Hls.DefaultConfig.loader),
          // A camera with a 30 s keyframe interval keeps the playlist
          // empty for about ten seconds after start; this many short
          // retries cover it. (404 and 429 do not get this long: see the
          // ERROR handler.)
          playlistLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 10_000,
              maxLoadTimeMs: 20_000,
              timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
              errorRetry: {
                maxNumRetry: 6,
                retryDelayMs: 1000,
                maxRetryDelayMs: 2000,
              },
            },
          },
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
          // hls.js keeps reloading a single-variant live playlist on any
          // status until its own retry count runs out, because there is no
          // other level to switch to. A 404 means zm-api reaped the session
          // and a 429 means stop asking, so neither is worth that polling:
          // stop loading and let the retry re-create the session behind
          // the gate.
          const code = data.response?.code;
          if (!data.fatal && data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR && (code === 404 || code === 429)) {
            hls.stopLoad();
            scheduleNetworkRetry();
            return;
          }
          if (!data.fatal) return;
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              scheduleNetworkRetry();
              break;
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

        // A playlist that loads means the network error is over. This

        // clears the caption only: a camera with a 30 s keyframe interval

        // produces one fragment every 30 s, and that is the signal for

        // "really playing again" below.

        hls.on(Hls.Events.LEVEL_LOADED, () => {

          setError((prev) => prev ? null : prev);

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
    }

    attemptSession();
  }, [monitorId, destroyPlayer, setState, t]);

  // Drop the player on unmount. No DELETE /stop — see the header comment.
  useEffect(() => destroyPlayer, [destroyPlayer]);

  return { videoRef, state, error, start, stop, pause: stop, hasAudio };
}
