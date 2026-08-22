import { describe, expect, it } from 'vitest';
import { displayDimensions, stageVideoClass, stageVideoStyle } from './orientation';

describe('displayDimensions', () => {
  it('keeps the sensor shape for Rotate0 / flips / 180°', () => {
    expect(displayDimensions({ width: 1920, height: 1080, orientation: 'Rotate0' }))
      .toEqual({ width: 1920, height: 1080, rotated: false, rotationDeg: 0 });
    expect(displayDimensions({ width: 1920, height: 1080, orientation: 'ROTATE_180' }).rotationDeg).toBe(180);
    expect(displayDimensions({ width: 1920, height: 1080, orientation: 'FlipHori' }).rotated).toBe(false);
  });

  it('swaps width and height for 90° / 270° in either spelling', () => {
    expect(displayDimensions({ width: 3840, height: 2160, orientation: 'ROTATE_90' }))
      .toEqual({ width: 2160, height: 3840, rotated: true, rotationDeg: 90 });
    expect(displayDimensions({ width: 1280, height: 720, orientation: 'Rotate270' }).rotationDeg).toBe(270);
  });

  it('falls back to 16:9 when dimensions are missing', () => {
    expect(displayDimensions({ width: 0, height: 0, orientation: null })).toMatchObject({ width: 16, height: 9 });
  });
});

describe('stageVideoStyle', () => {
  it('lays a rotated camera out at the swapped size and turns it back onto the container', () => {
    const style = stageVideoStyle({ width: 3840, height: 2160, orientation: 'ROTATE_90' });
    expect(style?.position).toBe('absolute');
    expect(style?.width).toBe(`${(3840 / 2160) * 100}%`);
    expect(style?.height).toBe(`${(2160 / 3840) * 100}%`);
    expect(style?.transform).toContain('rotate(90deg)');
    expect(stageVideoClass({ orientation: 'ROTATE_90' })).toBe('object-contain bg-black');
  });

  it('uses the simple rotate + scale fit in fullscreen', () => {
    const style = stageVideoStyle({ width: 3840, height: 2160, orientation: 'ROTATE_270' }, true);
    expect(style?.transform).toBe('rotate(270deg) scale(0.5625)');
    expect(stageVideoClass({ orientation: 'ROTATE_270' }, true)).toBe('w-full h-full object-contain bg-black');
  });

  it('returns the plain transform (or nothing) for unrotated cameras', () => {
    expect(stageVideoStyle({ width: 1920, height: 1080, orientation: 'Rotate0' })).toBeUndefined();
    expect(stageVideoStyle({ width: 1920, height: 1080, orientation: 'FlipHori' })?.transform).toBe('scaleX(-1)');
  });
});
