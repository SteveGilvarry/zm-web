import { describe, expect, it } from 'vitest';
import { heightOptions, stageStyle, widthOptions } from './watchStage';

const cam = { width: 2688, height: 1520, orientation: 'Rotate0' };
const portrait = { width: 1920, height: 1080, orientation: 'Rotate90' };

describe('width / height options', () => {
  it('appends each camera\'s native size once, after the legacy list', () => {
    const w = widthOptions([cam, cam, portrait]);
    expect(w.slice(0, 2)).toEqual(['auto', '100%']);
    expect(w.filter((v) => v === '2688px')).toHaveLength(1);
    // Rotated camera contributes its displayed (swapped) width.
    expect(w).toContain('1080px');
    expect(heightOptions([portrait])).toContain('1920px');
  });
});

describe('stageStyle', () => {
  const dims = { width: 1920, height: 1080 };
  /** Rotate90: displayed portrait. */
  const portraitDims = { width: 1080, height: 1920 };
  it('auto fills the column and keeps the camera aspect', () => {
    expect(stageStyle({ width: 'auto', height: 'auto', scale: '0' }, dims))
      .toMatchObject({ width: '100%', aspectRatio: '1920 / 1080', maxWidth: '100%' });
  });
  it('auto sizes a portrait camera to the height the page measured', () => {
    // The measurement is what keeps the picture on screen: the fallback
    // below subtracts a constant for the chrome above the stage, and adding
    // one control to that chrome once pushed a portrait camera's bottom off
    // the viewport with nothing to scroll.
    expect(stageStyle({ width: 'auto', height: 'auto', scale: '0' }, portraitDims, 640))
      .toMatchObject({ height: '640px', width: 'auto', aspectRatio: '1080 / 1920' });
  });

  it('falls back to the viewport guess only when nothing measured it', () => {
    for (const unmeasured of [undefined, 0]) {
      expect(stageStyle({ width: 'auto', height: 'auto', scale: '0' }, portraitDims, unmeasured))
        .toMatchObject({ height: 'calc(100vh - 14rem)' });
    }
  });

  it('auto sizes a portrait camera by viewport height instead of column width', () => {
    expect(stageStyle({ width: 'auto', height: 'auto', scale: '0' }, { width: 1080, height: 1920 }))
      .toMatchObject({ height: 'calc(100vh - 14rem)', width: 'auto', aspectRatio: '1080 / 1920' });
  });
  it('Actual uses the displayed pixel width; Max Npx caps the width', () => {
    expect(stageStyle({ width: 'auto', height: 'auto', scale: '100' }, dims)).toMatchObject({ width: '1920px' });
    expect(stageStyle({ width: 'auto', height: 'auto', scale: '640px' }, dims)).toMatchObject({ width: '100%', maxWidth: '640px' });
  });
  it('explicit Width / Height win over Scale; both together drop the aspect ratio', () => {
    expect(stageStyle({ width: '320px', height: 'auto', scale: '100' }, dims)).toMatchObject({ width: '320px', aspectRatio: '1920 / 1080' });
    const both = stageStyle({ width: '320px', height: '240px', scale: '0' }, dims);
    expect(both).toMatchObject({ width: '320px', height: '240px' });
    expect(both.aspectRatio).toBeUndefined();
  });
});
