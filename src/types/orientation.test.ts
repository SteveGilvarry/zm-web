import { describe, expect, it } from 'vitest';
import { isOrientationRotated, getOrientationStyle, getOrientationFillStyle } from './index';

describe('isOrientationRotated', () => {
  it('returns false for null / undefined / empty', () => {
    expect(isOrientationRotated(null)).toBe(false);
    expect(isOrientationRotated(undefined)).toBe(false);
    expect(isOrientationRotated('')).toBe(false);
  });

  it('returns true for Rotate90 / Rotate270 (CamelCase, the API default)', () => {
    expect(isOrientationRotated('Rotate90')).toBe(true);
    expect(isOrientationRotated('Rotate270')).toBe(true);
  });

  it('returns true for ROTATE_90 / ROTATE_270 (uppercase-underscore variant)', () => {
    // Some backends return this form; both must be handled.
    expect(isOrientationRotated('ROTATE_90')).toBe(true);
    expect(isOrientationRotated('ROTATE_270')).toBe(true);
  });

  it('returns false for non-rotating orientations', () => {
    expect(isOrientationRotated('Rotate0')).toBe(false);
    expect(isOrientationRotated('Rotate180')).toBe(false);
    expect(isOrientationRotated('FlipHori')).toBe(false);
    expect(isOrientationRotated('FlipVert')).toBe(false);
    expect(isOrientationRotated('ROTATE_180')).toBe(false);
  });

  it('returns false for unknown strings (defensive)', () => {
    expect(isOrientationRotated('garbage')).toBe(false);
  });
});

describe('getOrientationStyle', () => {
  it('returns undefined for null / undefined / empty / unknown', () => {
    expect(getOrientationStyle(null)).toBeUndefined();
    expect(getOrientationStyle(undefined)).toBeUndefined();
    expect(getOrientationStyle('')).toBeUndefined();
    expect(getOrientationStyle('garbage')).toBeUndefined();
  });

  it('returns undefined for Rotate0 (no-op)', () => {
    expect(getOrientationStyle('Rotate0')).toBeUndefined();
    expect(getOrientationStyle('ROTATE_0')).toBeUndefined();
  });

  it('applies rotate(90deg) + scale(0.5625) for Rotate90', () => {
    const style = getOrientationStyle('Rotate90');
    expect(style?.transform).toBe('rotate(90deg) scale(0.5625)');
    expect(style?.transformOrigin).toBe('center center');
  });

  it('applies rotate(270deg) + scale(0.5625) for Rotate270', () => {
    expect(getOrientationStyle('Rotate270')?.transform).toBe(
      'rotate(270deg) scale(0.5625)',
    );
  });

  it('applies rotate(180deg) (no scale needed — same bounding box) for Rotate180', () => {
    const style = getOrientationStyle('Rotate180');
    expect(style?.transform).toBe('rotate(180deg)');
    expect(style?.transformOrigin).toBeUndefined();
  });

  it('applies scaleX(-1) for FlipHori', () => {
    expect(getOrientationStyle('FlipHori')?.transform).toBe('scaleX(-1)');
    expect(getOrientationStyle('FlipHorizontal')?.transform).toBe('scaleX(-1)');
  });

  it('applies scaleY(-1) for FlipVert', () => {
    expect(getOrientationStyle('FlipVert')?.transform).toBe('scaleY(-1)');
    expect(getOrientationStyle('FlipVertical')?.transform).toBe('scaleY(-1)');
  });

  it('normalises across format variations (underscore + case)', () => {
    // All these refer to the same logical orientation. The normaliser strips
    // underscores/whitespace and lowercases before matching the switch.
    expect(getOrientationStyle('ROTATE_90')?.transform).toBe(
      'rotate(90deg) scale(0.5625)',
    );
    expect(getOrientationStyle('rotate_90')?.transform).toBe(
      'rotate(90deg) scale(0.5625)',
    );
    expect(getOrientationStyle('Rotate 90')?.transform).toBe(
      'rotate(90deg) scale(0.5625)',
    );
    expect(getOrientationStyle('FLIP_HORI')?.transform).toBe('scaleX(-1)');
  });
});

describe('getOrientationFillStyle — used by event detail playback', () => {
  // Returns the swap-dimensions style used when the parent container is
  // already in the post-rotation aspect (e.g. event.width/height are the
  // portrait values for a rotated camera). The video is the camera's raw
  // landscape pixels; the style rotates + over-sizes so it fills the
  // portrait box without letterboxing.

  it('returns undefined for null / undefined / empty', () => {
    expect(getOrientationFillStyle(null)).toBeUndefined();
    expect(getOrientationFillStyle(undefined)).toBeUndefined();
    expect(getOrientationFillStyle('')).toBeUndefined();
  });

  it('returns undefined for non-rotating orientations (Rotate0, Rotate180, flips)', () => {
    expect(getOrientationFillStyle('Rotate0')).toBeUndefined();
    expect(getOrientationFillStyle('Rotate180')).toBeUndefined();
    expect(getOrientationFillStyle('FlipHori')).toBeUndefined();
    expect(getOrientationFillStyle('FlipVert')).toBeUndefined();
  });

  it('returns a 90° rotation + 16:9-to-9:16 swap for Rotate90', () => {
    const style = getOrientationFillStyle('Rotate90');
    expect(style?.position).toBe('absolute');
    expect(style?.transform).toBe('translate(-50%, -50%) rotate(90deg)');
    expect(style?.width).toBe('177.7778%');
    expect(style?.height).toBe('56.25%');
    expect(style?.maxWidth).toBe('none');
    expect(style?.maxHeight).toBe('none');
  });

  it('returns a 270° rotation for Rotate270', () => {
    expect(getOrientationFillStyle('Rotate270')?.transform).toBe(
      'translate(-50%, -50%) rotate(270deg)',
    );
  });

  it('accepts the backend ROTATE_90 / ROTATE_270 variants', () => {
    expect(getOrientationFillStyle('ROTATE_90')?.transform).toBe(
      'translate(-50%, -50%) rotate(90deg)',
    );
    expect(getOrientationFillStyle('ROTATE_270')?.transform).toBe(
      'translate(-50%, -50%) rotate(270deg)',
    );
  });

  it('returns undefined for unknown strings (defensive)', () => {
    expect(getOrientationFillStyle('garbage')).toBeUndefined();
  });
});
