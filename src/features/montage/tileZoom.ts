import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** Multiplier per zoom click (the panzoom library's default step). */
export const TILE_ZOOM_STEP = 1.3;
export const TILE_ZOOM_MAX = 8;

export interface TileView {
  zoom: number;
  /** Pan, in px of the frame, of the scaled picture's centre. */
  x: number;
  y: number;
}

export const TILE_VIEW_RESET: TileView = { zoom: 1, x: 0, y: 0 };

/**
 * The picture may not be panned past its own edge: at zoom `z` the scaled
 * box overhangs the frame by `(z - 1) * size / 2` on each side.
 */
export function clampPan(view: TileView, width: number, height: number): TileView {
  if (view.zoom <= 1) return TILE_VIEW_RESET;
  const maxX = ((view.zoom - 1) * width) / 2;
  const maxY = ((view.zoom - 1) * height) / 2;
  return {
    zoom: view.zoom,
    x: Math.max(-maxX, Math.min(maxX, view.x)),
    y: Math.max(-maxY, Math.min(maxY, view.y)),
  };
}

/**
 * Zoom by `factor` keeping the point `(px, py)` (offset from the frame's
 * centre, in px) where it is on screen, as panzoom's `zoomWithWheel` and
 * Shift+click do. The buttons zoom about the centre (0, 0).
 */
export function zoomAbout(view: TileView, factor: number, px: number, py: number, width: number, height: number): TileView {
  const zoom = Math.max(1, Math.min(TILE_ZOOM_MAX, view.zoom * factor));
  if (zoom === view.zoom) return view;
  const k = zoom / view.zoom;
  return clampPan({ zoom, x: px - k * (px - view.x), y: py - k * (py - view.y) }, width, height);
}

export interface TileZoom {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Apply to the element wrapping the stream. */
  style: CSSProperties | undefined;
  /**
   * Spread on the tile's frame (the unscaled box): legacy panzoom's
   * gestures — Shift+click zooms in at the pointer, Ctrl+click zooms out,
   * Ctrl+Shift+click resets, and a drag pans a zoomed picture.
   */
  gestures: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    title: string;
  };
}

/** Zoom and pan state for one tile's stream: zoom `1` is the natural fit. */
export function useTileZoom(): TileZoom {
  const { t } = useTranslation();
  const [view, setView] = useState<TileView>(TILE_VIEW_RESET);
  // The frame's size from the last gesture, so the buttons can clamp too.
  const size = useRef({ width: 0, height: 0 });
  const drag = useRef<{ id: number; startX: number; startY: number; from: TileView } | null>(null);

  const measure = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    size.current = { width: r.width, height: r.height };
    return r;
  };
  const byButton = (factor: number) =>
    setView((v) => zoomAbout(v, factor, 0, 0, size.current.width, size.current.height));

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    // The tile's own buttons and selects keep their clicks.
    if ((e.target as Element).closest('button, a, select, input')) return;
    const r = measure(e.currentTarget);
    const px = e.clientX - (r.left + r.width / 2);
    const py = e.clientY - (r.top + r.height / 2);
    if (e.ctrlKey && e.shiftKey) { setView(TILE_VIEW_RESET); return; }
    if (e.shiftKey) { setView((v) => zoomAbout(v, TILE_ZOOM_STEP, px, py, r.width, r.height)); return; }
    if (e.ctrlKey) { setView((v) => zoomAbout(v, 1 / TILE_ZOOM_STEP, px, py, r.width, r.height)); return; }
    if (view.zoom <= 1) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, from: view };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const { width, height } = size.current;
    setView(clampPan({ ...d.from, x: d.from.x + e.clientX - d.startX, y: d.from.y + e.clientY - d.startY }, width, height));
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return {
    zoom: view.zoom,
    zoomIn: () => byButton(TILE_ZOOM_STEP),
    zoomOut: () => byButton(1 / TILE_ZOOM_STEP),
    style: view.zoom === 1
      ? undefined
      : {
        transform: view.x || view.y
          ? `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`
          : `scale(${view.zoom})`,
        transformOrigin: 'center',
      },
    gestures: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      // Legacy's tooltip on `#monitor<id>`, word for word.
      title: t('Shift+Click to Zoom, Click+Drag to Pan \nCtrl+Click to Zoom out, Ctrl+Shift+Click to Zoom out completely'),
    },
  };
}
