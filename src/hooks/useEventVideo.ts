import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Hls from 'hls.js';
import { getAuthToken } from '@/api/client';
import {
  getEventStreamUrl,
  getEventPlaylistUrl,
  type EventVideoInfo,
} from '@/api/events';

/**
 * How an event is being played back:
 * - `direct`      — progressive MP4 with HTTP Range (H.264, plays everywhere).
 * - `hls`         — fMP4 HLS, decoded by hls.js (MSE) or Safari's native player.
 * - `unsupported` — HEVC the current browser can't decode; surface a fallback.
 */
export type EventPlaybackMode = 'direct' | 'hls' | 'unsupported';

export interface EventVideoResult {
  mode: EventPlaybackMode;
  error: string | null;
}

let nativeHlsCache: boolean | null = null;
/** Safari-style native HLS (`canPlayType` on a detached element), cached. */
function nativeHlsSupported(): boolean {
  if (nativeHlsCache == null) {
    nativeHlsCache =
      typeof document !== 'undefined' &&
      document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
  }
  return nativeHlsCache;
}

/**
 * Pick the playback mode from the backend's recommendation and the browser's
 * capabilities. Pure, so the hook can derive it during render instead of
 * setting state from its effect.
 */
function resolvePlaybackMode(info: EventVideoInfo | undefined): EventPlaybackMode {
  if (!info || info.recommended_mode !== 'hls') return 'direct';
  if (Hls.isSupported() || nativeHlsSupported()) return 'hls';
  return 'unsupported';
}

/**
 * Wires the correct playback source onto a shared <video> element, branching on
 * the backend's `recommended_mode`. The element keeps driving its own controls
 * (play/pause/seek/timeupdate) for both modes, so the page's existing player UI
 * works unchanged — this hook only owns *what* is attached, not the chrome.
 *
 * Media URLs carry `?token=` because <video>/segment fetches can't set headers;
 * hls.js additionally attaches the Bearer header via xhrSetup. HLS segment URIs
 * are relative and are left untouched (the backend serves them off the playlist
 * path).
 */
export function useEventVideo(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  eventId: number,
  info: EventVideoInfo | undefined,
): EventVideoResult {
  const { t } = useTranslation();
  const hlsRef = useRef<Hls | null>(null);
  // Event id whose HLS session hit a fatal (almost always undecodable-codec)
  // error. Keyed by event so a new event starts clean without an effect
  // having to reset it.
  const [fatalEventId, setFatalEventId] = useState<number | null>(null);

  const baseMode = useMemo(() => resolvePlaybackMode(info), [info]);
  const mode: EventPlaybackMode = fatalEventId === eventId ? 'unsupported' : baseMode;
  const error = mode === 'unsupported'
    ? t('This video codec is not supported in this browser.')
    : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !info) return;

    const destroy = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // Tear down any source carried over from a previous event/mode.
    destroy();
    video.removeAttribute('src');
    video.load();

    const token = getAuthToken() ?? undefined;

    // Direct progressive MP4 — native seeking works out of the box via Range.
    if (baseMode === 'direct') {
      video.src = getEventStreamUrl(eventId, token);
      return destroy;
    }
    if (baseMode === 'unsupported') return destroy;

    // HLS branch (HEVC). hls.js handles it wherever the browser's MSE can
    // decode the codec; otherwise fall back to Safari's native HLS player.
    const playlistUrl = getEventPlaylistUrl(eventId, token);

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => {
          const tok = getAuthToken();
          if (tok) xhr.setRequestHeader('Authorization', `Bearer ${tok}`);
        },
      });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        // A fatal error here is almost always "MSE can't decode this codec"
        // (HEVC in a software-only Chrome) — present it as unsupported rather
        // than a transient stream error.
        if (data.fatal) {
          setFatalEventId(eventId);
          destroy();
        }
      });
      hls.loadSource(playlistUrl);
      return destroy;
    }

    // Safari native HLS. <video> can't send headers, so auth rides on
    // ?token=; relative segment URIs are resolved by the player against the
    // playlist URL and left as the backend wrote them.
    video.src = playlistUrl;
    return destroy;
  }, [videoRef, eventId, info, baseMode]);

  return { mode, error };
}
