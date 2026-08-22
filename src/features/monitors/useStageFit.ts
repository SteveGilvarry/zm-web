import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { fitToBox } from '@/components/common/fitToBox';

export interface Box { width: number; height: number }

/**
 * Measure an element, through a callback ref.
 *
 * A callback ref and not a `RefObject`: the regions this measures are behind
 * loading and not-found early returns, so an effect keyed on a ref object
 * runs once against `null` and never re-attaches. That is what left the watch
 * stage measuring 0×0 — and a 0×0 box means the fit falls back to
 * "full width plus an aspect ratio", which `max-height` then squashes into
 * the wrong shape, so a portrait camera rendered a frame and a half tall with
 * nothing to scroll.
 */
export function useMeasuredBox<T extends HTMLElement>(): [(el: T | null) => void, Box] {
  const [node, setNode] = useState<T | null>(null);
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const measure = () => {
      const r = node.getBoundingClientRect();
      setBox({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return [ref, box];
}

/**
 * The largest box with the camera's displayed aspect that fits the region.
 *
 * CSS cannot express "fit both axes" for a non-replaced element with an
 * aspect ratio — `max-height` does not feed back into the derived width — so
 * the region is measured and the box sized outright. Portrait cameras are
 * sized by height, landscape by width, which is the whole point.
 */
export function stageFitStyle(box: Box, w: number, h: number): CSSProperties {
  const fitted = fitToBox(box.width, box.height, w > 0 && h > 0 ? w / h : 16 / 9);
  if (!fitted) {
    // Not measured yet. `max-height: 100%` without a width keeps a portrait
    // camera inside the frame instead of overflowing it while we wait.
    return { maxWidth: '100%', maxHeight: '100%', aspectRatio: `${w || 16} / ${h || 9}` };
  }
  return { width: Math.floor(fitted.width), height: Math.floor(fitted.height) };
}
