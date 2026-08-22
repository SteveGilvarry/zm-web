import type { CSSProperties } from 'react';
import type { Monitor } from '@/types';
import { displayDimensions } from './orientation';

/**
 * The legacy Width / Height / Scale selects (watch.php, cycle.php,
 * montage.php). Values are the legacy wire values so cookies-turned-prefs
 * read the same; labels are translated by the page.
 */
export type StageWidth = string;  // 'auto' | '100%' | '<n>px'
export type StageHeight = string; // 'auto' | '<n>px'
export type StageScale = string;  // '0' (auto) | '100' (actual) | 'fit_to_width' | '<n>px' (max width)

export interface StageSize {
  width: StageWidth;
  height: StageHeight;
  scale: StageScale;
}

export const DEFAULT_STAGE_SIZE: StageSize = { width: 'auto', height: 'auto', scale: '0' };

const BASE_WIDTHS = ['auto', '100%', '160px', '320px', '352px', '640px', '1280px', '1920px'];
const BASE_HEIGHTS = ['auto', '240px', '480px', '720px', '1080px'];

/** Width options plus the camera's native width (legacy appends it). */
export function widthOptions(monitors: Array<Pick<Monitor, 'width' | 'height' | 'orientation'>>): string[] {
  const out = [...BASE_WIDTHS];
  for (const m of monitors) {
    const w = `${displayDimensions(m).width}px`;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

export function heightOptions(monitors: Array<Pick<Monitor, 'width' | 'height' | 'orientation'>>): string[] {
  const out = [...BASE_HEIGHTS];
  for (const m of monitors) {
    const h = `${displayDimensions(m).height}px`;
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

/** Wire values of the Scale select; the page maps them to labels. */
export const SCALE_VALUES = ['0', '100', 'fit_to_width', '480px', '640px', '800px', '1024px', '1280px', '1600px'] as const;

/**
 * Inline style for the stage box. Explicit Width / Height win; otherwise
 * Scale decides: auto and fit-to-width fill the column, Actual uses the
 * camera's displayed pixel size, `Max Npx` caps the width.
 */
export function stageStyle(
  size: StageSize,
  dims: { width: number; height: number },
  /**
   * Height actually left below the stage, measured by the page. Portrait
   * cameras on Auto are sized by height, and the fallback below guesses
   * that height from the viewport minus a constant — a guess that breaks
   * the moment anything is added to the chrome above (adding the monitor
   * chooser to the classic action row pushed the picture off-screen). Pass
   * a measurement and the guess is not used.
   */
  availableHeightPx?: number,
): CSSProperties {
  const style: CSSProperties = {
    aspectRatio: dims.width > 0 && dims.height > 0 ? `${dims.width} / ${dims.height}` : '16 / 9',
    maxWidth: '100%',
  };
  const explicitW = size.width !== 'auto';
  const explicitH = size.height !== 'auto';
  if (explicitW) style.width = size.width;
  if (explicitH) style.height = size.height;
  if (explicitW || explicitH) {
    if (explicitW && explicitH) delete style.aspectRatio;
    return style;
  }
  const portrait = dims.height > dims.width;
  switch (size.scale) {
    case '100':
      style.width = dims.width > 0 ? `${dims.width}px` : '100%';
      break;
    case '0':
      // Auto = fit the viewport. A portrait camera at full column width
      // would be taller than the screen, so it is sized by height instead.
      if (portrait) {
        style.height = availableHeightPx && availableHeightPx > 0
          ? `${Math.floor(availableHeightPx)}px`
          : 'calc(100vh - 14rem)';
        style.width = 'auto';
      } else {
        style.width = '100%';
      }
      break;
    case 'fit_to_width':
      style.width = '100%';
      break;
    default:
      if (/^\d+px$/.test(size.scale)) {
        style.width = '100%';
        style.maxWidth = size.scale;
      } else {
        style.width = '100%';
      }
  }
  return style;
}
