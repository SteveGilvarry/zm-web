import { useEffect, useState, type RefObject } from 'react';

/** How often the readout is refreshed, in ms (legacy's status poll is 1 s). */
export const VIEWING_FPS_WINDOW_MS = 1000;

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { presentedFrames: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Legacy's "Viewing FPS": the rate the browser actually paints, as opposed to
 * the rate the camera captures at. zms reports it from the server; here the
 * page counts the frames the `<video>` presents, through
 * `requestVideoFrameCallback`. Returns null while inactive or when the browser
 * has no frame callback (the readout is then left blank, as legacy leaves it
 * before the first status answer).
 */
export function useViewingFps(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
): number | null {
  const [fps, setFps] = useState<number | null>(null);
  // Clear the readout during render when the stream stops, not from an effect.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setFps(null);
  }

  useEffect(() => {
    const video = videoRef.current as FrameCallbackVideo | null;
    if (!active || !video || typeof video.requestVideoFrameCallback !== 'function') return;
    let handle = 0;
    let cancelled = false;
    let windowStart: number | null = null;
    let framesAtStart = 0;
    const onFrame = (now: number, meta: { presentedFrames: number }) => {
      if (cancelled) return;
      if (windowStart === null) {
        windowStart = now;
        framesAtStart = meta.presentedFrames;
      } else if (now - windowStart >= VIEWING_FPS_WINDOW_MS) {
        setFps(((meta.presentedFrames - framesAtStart) * 1000) / (now - windowStart));
        windowStart = now;
        framesAtStart = meta.presentedFrames;
      }
      handle = video.requestVideoFrameCallback!(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => {
      cancelled = true;
      video.cancelVideoFrameCallback?.(handle);
    };
  }, [videoRef, active]);

  return active ? fps : null;
}
