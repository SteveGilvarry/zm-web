import { directionFor, type TextDirection } from './languages';

/**
 * Bind the document's text direction and language to the active locale.
 *
 * Everything else in the app is direction-agnostic by construction: layout
 * uses logical CSS (`ms-`, `pe-`, `start-`, `text-start`), directional icons
 * carry `rtl:-scale-x-100`, and physical media — video stages, timelines,
 * the PTZ pad, scrubbers — sit in a `dir="ltr"` container so they never
 * mirror. A vertical writing mode (`writing-mode: vertical-*`) is not a
 * target: no ZoneMinder locale needs it for UI chrome, and logical
 * properties keep the block/inline axes correct if one ever does.
 */
export function applyDirection(lng: string): TextDirection {
  const dir = directionFor(lng);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root.dir !== dir) root.dir = dir;
    if (root.lang !== lng) root.lang = lng;
  }
  return dir;
}

/** Current document direction (for the rare imperative case). */
export function currentDirection(): TextDirection {
  if (typeof document === 'undefined') return 'ltr';
  return document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}
