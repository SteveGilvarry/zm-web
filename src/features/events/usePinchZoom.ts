import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

export interface PinchZoomState {
  scale: number;
  x: number;
  y: number;
}

export const PINCH_MIN = 1;
export const PINCH_MAX = 8;

const IDENTITY: PinchZoomState = { scale: 1, x: 0, y: 0 };

/**
 * Zoom a point of the content towards/away from the pointer.
 *
 * `cx`/`cy` are the gesture's centre relative to the element's own box, so
 * whatever is under the fingers stays under the fingers as the scale changes
 * — the thing that separates a zoom that feels attached to the image from
 * one that slides out from under you.
 */
export function zoomAt(
  state: PinchZoomState,
  nextScale: number,
  cx: number,
  cy: number,
): PinchZoomState {
  const scale = clamp(nextScale, PINCH_MIN, PINCH_MAX);
  if (scale === PINCH_MIN) return IDENTITY;
  const ratio = scale / state.scale;
  return {
    scale,
    x: cx - (cx - state.x) * ratio,
    y: cy - (cy - state.y) * ratio,
  };
}

/** Keep the content covering the frame: no panning empty space into view. */
export function clampPan(
  state: PinchZoomState,
  width: number,
  height: number,
): PinchZoomState {
  if (state.scale <= PINCH_MIN) return IDENTITY;
  const maxX = (width * (state.scale - 1)) / 2;
  const maxY = (height * (state.scale - 1)) / 2;
  return {
    scale: state.scale,
    // The transform origin is the centre, so the slack is symmetric.
    x: clamp(state.x, -maxX * 2, maxX * 2),
    y: clamp(state.y, -maxY * 2, maxY * 2),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Pinch-to-zoom and drag-to-pan for a media element.
 *
 * A browser's own pinch zooms the whole page, which is useless in a fixed
 * app frame and does nothing at all in fullscreen — so the gesture is
 * handled here and applied as a transform on the element:
 *
 *  - two pointers (touch or pen): pinch, tracking the midpoint
 *  - trackpad pinch, which arrives as a ctrl-key wheel event
 *  - one pointer drags once zoomed in
 *  - double-click / double-tap resets
 *
 * The listeners are non-passive because a pinch must not also scroll the
 * page behind it. It stays attached in fullscreen, since fullscreen only
 * moves the element, it does not remount it.
 */
export function usePinchZoom<T extends HTMLElement>(enabled = true) {
  // A callback ref, not a RefObject: the element it attaches to is rendered
  // conditionally (the player only exists once the event has loaded), and an
  // effect keyed on a RefObject would have run once against a null and never
  // re-attached.
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);
  const [state, setState] = useState<PinchZoomState>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number } | null>(null);
  // The listeners are attached once and read the live transform through a
  // ref; writing it in an effect (not during render) keeps React's rules of
  // refs happy.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reset = useCallback(() => setState(IDENTITY), []);

  useEffect(() => {
    const el = node;
    if (!el || !enabled) return;

    const localCentre = (points: { x: number; y: number }[]) => {
      const r = el.getBoundingClientRect();
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
      // Relative to the element's centre, which is the transform origin.
      return { cx: cx - (r.left + r.width / 2), cy: cy - (r.top + r.height / 2) };
    };

    const apply = (next: PinchZoomState) => {
      const r = el.getBoundingClientRect();
      setState(clampPan(next, r.width / (stateRef.current.scale || 1), r.height / (stateRef.current.scale || 1)));
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: stateRef.current.scale };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      const prev = pointers.current.get(e.pointerId)!;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2 && gesture.current) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (gesture.current.distance > 0) {
          e.preventDefault();
          const { cx, cy } = localCentre([a, b]);
          apply(zoomAt(stateRef.current, gesture.current.scale * (distance / gesture.current.distance), cx, cy));
        }
        return;
      }

      // One pointer: pan, but only when there is something to pan.
      if (stateRef.current.scale > PINCH_MIN && e.buttons !== 0) {
        e.preventDefault();
        apply({
          scale: stateRef.current.scale,
          x: stateRef.current.x + (e.clientX - prev.x),
          y: stateRef.current.y + (e.clientY - prev.y),
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) gesture.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      // A trackpad pinch is a wheel event with ctrlKey set. A plain wheel is
      // a scroll and is left alone.
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { cx, cy } = localCentre([{ x: e.clientX, y: e.clientY }]);
      apply(zoomAt(stateRef.current, stateRef.current.scale * Math.exp(-e.deltaY / 200), cx, cy));
    };

    const onDoubleClick = () => setState(IDENTITY);

    // Captured for the cleanup: `pointers` is stable, but the linter wants
    // the read hoisted out of the teardown closure.
    const tracked = pointers.current;

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('pointerleave', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDoubleClick);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('pointerleave', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDoubleClick);
      tracked.clear();
      gesture.current = null;
    };
  }, [node, enabled]);

  const zoomed = state.scale > PINCH_MIN;
  const style: CSSProperties = {
    transform: zoomed ? `translate(${state.x}px, ${state.y}px) scale(${state.scale})` : undefined,
    transformOrigin: 'center center',
    // Without this the browser takes the gesture for its own page zoom.
    touchAction: zoomed ? 'none' : 'pinch-zoom',
    cursor: zoomed ? 'grab' : undefined,
  };

  return { ref, scale: state.scale, zoomed, style, reset };
}
