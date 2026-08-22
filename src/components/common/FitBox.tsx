import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { fitToBox } from './fitToBox';

/**
 * A box of fixed aspect ratio, sized to the largest that fits its parent.
 *
 * `aspect-ratio` alone cannot do this: with a width constraint the height
 * runs past the bottom of the frame (which is how a portrait recording ended
 * up taller than the page), and clamping with `max-height` breaks the ratio
 * instead of shrinking the box. So the parent is measured and the box gets
 * explicit pixels.
 *
 * The parent must have a height of its own — inside the app frame that means
 * a `flex-1 min-h-0` cell.
 */
export function FitBox({
  aspect,
  maxWidth,
  className,
  style,
  children,
}: {
  /** Width ÷ height of the content. */
  aspect: number;
  /** Optional cap in px, e.g. the player's Scale setting. */
  maxWidth?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const fitted = fitToBox(box.width, box.height, aspect, maxWidth);

  return (
    <div ref={hostRef} className={clsx('flex items-center justify-center min-h-0', className)}>
      <div
        style={{
          ...style,
          ...(fitted
            ? { width: `${fitted.width}px`, height: `${fitted.height}px` }
            : { aspectRatio: `${aspect}`, maxWidth: maxWidth ? `${maxWidth}px` : undefined }),
        }}
      >
        {children}
      </div>
    </div>
  );
}
