import { useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { webrtcManager } from '@/streaming/webrtcManager';
import type { StreamConnectionState } from '@/types';

export interface StreamHookResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: StreamConnectionState;
  error: string | null;
  start: () => void;
  stop: () => void;
  hasAudio: boolean;
}

/**
 * Subscribes to a monitor's shared WebRTC stream (see `webrtcManager`).
 *
 * The connection lives in the manager, not in this hook, so it survives route
 * navigation: unmounting only releases a reference, and the manager keeps the
 * stream alive through a grace period. Each consumer attaches the shared
 * MediaStream to its own <video> element.
 */
export function useWebRtcStream(monitorId: number): StreamHookResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Whether this hook instance currently holds a reference on the manager.
  const acquiredRef = useRef(false);

  const subscribe = useCallback(
    (onChange: () => void) => webrtcManager.subscribe(monitorId, onChange),
    [monitorId],
  );
  const getSnapshot = useCallback(
    () => webrtcManager.getSnapshot(monitorId),
    [monitorId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // Attach (or detach) the shared MediaStream to this component's <video>.
  // Runs after every render (no dep array) because the <video> element may
  // mount *after* the stream is already known — e.g. behind a route's loading
  // skeleton — and ref changes don't trigger effects. The work is idempotent:
  // srcObject is only touched when it actually differs.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (snapshot.mediaStream) {
      if (video.srcObject !== snapshot.mediaStream) {
        video.srcObject = snapshot.mediaStream;
        video.play().catch(() => {});
      }
    } else if (video.srcObject) {
      video.srcObject = null;
    }
  });

  const start = useCallback(() => {
    if (acquiredRef.current) return;
    acquiredRef.current = true;
    webrtcManager.acquire(monitorId);
  }, [monitorId]);

  const stop = useCallback(() => {
    acquiredRef.current = false;
    webrtcManager.stopHard(monitorId);
  }, [monitorId]);

  // Release this hook's reference on unmount. The manager keeps the connection
  // alive through a grace period, so navigating between views of the same
  // monitor does not drop the stream.
  useEffect(() => {
    return () => {
      if (acquiredRef.current) {
        acquiredRef.current = false;
        webrtcManager.release(monitorId);
      }
    };
  }, [monitorId]);

  return {
    videoRef,
    state: snapshot.state,
    error: snapshot.error,
    hasAudio: snapshot.hasAudio,
    start,
    stop,
  };
}
