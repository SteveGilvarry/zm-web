import { useEffect, useState, type RefObject } from 'react';

/**
 * Tracks whether an element is within (or near) the viewport via
 * IntersectionObserver. Used to bound per-card work — snapshot polling, live
 * previews — to what the user can actually see, so cost scales with the
 * viewport rather than the total number of monitors.
 *
 * @param rootMargin grows the observed area, e.g. '200px' warms a card up
 *                   shortly before it scrolls into view.
 */
export function useInViewport<T extends Element>(
  ref: RefObject<T | null>,
  rootMargin = '0px',
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return inView;
}
