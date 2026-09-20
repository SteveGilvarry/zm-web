import { useCallback, useEffect, useRef, useState } from 'react';

export interface ViewingTimeoutOptions {
  /** Only arm the timer while something is actually playing. */
  enabled: boolean;
  /** `ZM_WEB_VIEWING_TIMEOUT`, seconds. 0 or less disables the check. */
  timeoutS: number;
  /** Tear the stream down. Called once when the timer fires. */
  onIdle: () => void;
  /** Start it again after the operator answers the prompt. */
  onResume: () => void;
}

export interface ViewingTimeoutState {
  /** "Are you still watching?" is up and the stream is stopped. */
  prompted: boolean;
  /** The prompt's only button: resume and re-arm the timer. */
  resume: () => void;
}

/**
 * `ZM_WEB_VIEWING_TIMEOUT` (watch.js:1117-1150): after that many seconds with
 * no pointer or key activity, stop the stream and ask whether anyone is still
 * there. A box with a forgotten browser tab open should not keep a camera
 * streaming all night.
 *
 * Legacy binds `document.onmousemove` / `onkeydown`; this uses capturing
 * listeners so activity inside a fullscreened stage counts too.
 */
export function useViewingTimeout(options: ViewingTimeoutOptions): ViewingTimeoutState {
  const { enabled, timeoutS } = options;
  const [prompted, setPrompted] = useState(false);
  // The callers pass fresh arrows every render; the timer must not restart on
  // each one, so it reads them through a ref.
  const handlers = useRef(options);
  useEffect(() => { handlers.current = options; });

  useEffect(() => {
    if (!enabled || timeoutS <= 0 || prompted) return;
    let timer = 0;
    const fire = () => {
      setPrompted(true);
      handlers.current.onIdle();
    };
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, timeoutS * 1000);
    };
    reset();
    document.addEventListener('mousemove', reset, true);
    document.addEventListener('keydown', reset, true);
    document.addEventListener('touchstart', reset, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousemove', reset, true);
      document.removeEventListener('keydown', reset, true);
      document.removeEventListener('touchstart', reset, true);
    };
  }, [enabled, timeoutS, prompted]);

  const resume = useCallback(() => {
    setPrompted(false);
    handlers.current.onResume();
  }, []);

  return { prompted, resume };
}
