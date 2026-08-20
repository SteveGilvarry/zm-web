import type { CSSProperties } from 'react';
import { getOrientationStyle, isOrientationRotated } from '@/types';

export interface DisplayDimensions {
  /** Width after rotation — what the operator sees. */
  width: number;
  height: number;
  rotated: boolean;
  rotationDeg: 0 | 90 | 180 | 270;
}

/**
 * The shape a camera shows on screen. ZoneMinder stores the sensor's native
 * width/height; a ROTATE_90/270 monitor is displayed portrait, so every
 * stage, thumbnail and zone editor sizes itself from the swapped pair.
 */
export function displayDimensions(
  monitor: { width?: number | null; height?: number | null; orientation?: string | null },
): DisplayDimensions {
  const rawW = monitor.width || 16;
  const rawH = monitor.height || 9;
  const norm = (monitor.orientation ?? '').replace(/[_\s]/g, '').toLowerCase();
  const rotationDeg: DisplayDimensions['rotationDeg'] =
    norm === 'rotate90' ? 90 : norm === 'rotate180' ? 180 : norm === 'rotate270' ? 270 : 0;
  const rotated = isOrientationRotated(monitor.orientation);
  return {
    width: rotated ? rawH : rawW,
    height: rotated ? rawW : rawH,
    rotated,
    rotationDeg,
  };
}

/**
 * Inline style for a `<video>` whose container already has the camera's
 * displayed (post-rotation) aspect. Rotated cameras get the swap-dimensions
 * treatment — the element is laid out landscape at the container's swapped
 * size and turned back onto the container's footprint, no letterboxing.
 * Everything else falls through to the plain transform (flip / 180°).
 *
 * `fullscreen`: the container is then screen-shaped rather than camera-
 * shaped, where the simple rotate + scale(9/16) fit applies.
 */
export function stageVideoStyle(
  monitor: { width?: number | null; height?: number | null; orientation?: string | null },
  fullscreen = false,
): CSSProperties | undefined {
  const dims = displayDimensions(monitor);
  if (!dims.rotated || fullscreen) return getOrientationStyle(monitor.orientation);
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: `${(dims.height / dims.width) * 100}%`,
    height: `${(dims.width / dims.height) * 100}%`,
    // Tailwind preflight applies `max-width: 100%` to <video>; override so
    // the swapped-dimension sizing isn't clamped to the container.
    maxWidth: 'none',
    maxHeight: 'none',
    transform: `translate(-50%, -50%) rotate(${dims.rotationDeg}deg)`,
    transformOrigin: 'center',
  };
}

/** Class list that pairs with {@link stageVideoStyle}. */
export function stageVideoClass(
  monitor: { orientation?: string | null },
  fullscreen = false,
): string {
  return isOrientationRotated(monitor.orientation) && !fullscreen
    ? 'object-contain bg-black'
    : 'w-full h-full object-contain bg-black';
}
