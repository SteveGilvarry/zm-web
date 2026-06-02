import { describe, expect, it } from 'vitest';
import { isOrientationRotated, getOrientationStyle } from './index';

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
