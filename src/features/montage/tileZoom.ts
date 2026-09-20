import { useState, type CSSProperties } from 'react';

/** Multiplier per zoom click (the panzoom library's default step). */
export const TILE_ZOOM_STEP = 1.3;
export const TILE_ZOOM_MAX = 8;

export interface TileZoom {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Apply to the element wrapping the stream; scales about the centre. */
  style: CSSProperties | undefined;
}

/** Zoom state for one tile's stream: `1` is the natural fit. */
export function useTileZoom(): TileZoom {
  const [zoom, setZoom] = useState(1);
  return {
    zoom,
    zoomIn: () => setZoom((z) => Math.min(TILE_ZOOM_MAX, z * TILE_ZOOM_STEP)),
    zoomOut: () => setZoom((z) => Math.max(1, z / TILE_ZOOM_STEP)),
    style: zoom === 1 ? undefined : { transform: `scale(${zoom})`, transformOrigin: 'center' },
  };
}
