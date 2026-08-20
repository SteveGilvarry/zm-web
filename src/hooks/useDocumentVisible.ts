import { useEffect, useState } from 'react';

/**
 * Whether the tab is in the foreground, with hysteresis: flips to `false`
 * only after the document has been hidden for `hiddenDelayMs`, and back to
 * `true` immediately on return. Live tiles use it to let go of their
 * streams when the wall is backgrounded without flapping on a quick
 * alt-tab.
 */
export function useDocumentVisible(hiddenDelayMs = 10_000): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          setVisible(false);
        }, hiddenDelayMs);
      } else {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        setVisible(true);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      if (timer) clearTimeout(timer);
    };
  }, [hiddenDelayMs]);

  return visible;
}
