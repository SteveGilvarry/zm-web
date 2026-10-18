import { useEffect, useState, type RefObject } from 'react';

/** Whether `ref`'s element is the document's fullscreen element right now. */
export function useIsFullscreen(ref: RefObject<Element | null>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);
  return on;
}
