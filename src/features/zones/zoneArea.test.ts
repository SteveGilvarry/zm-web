import { describe, expect, it } from 'vitest';
import { coordsArePercent, coordsToPixels, polygonArea, zoneArea, zoneColour, zoneOutOfBounds, zonePixelPoints, zoneReportedArea } from './zoneArea';

const frame = { width: 100, height: 50 };

describe('polygonArea', () => {
  it('computes the shoelace area regardless of winding', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([...sq].reverse())).toBe(100);
    expect(polygonArea(sq.slice(0, 2))).toBe(0);
  });
});

describe('zoneReportedArea — legacy "Area (px/%)" for a saved zone', () => {
  it('prints ZoneMinder\'s stored Area and its share of the frame', () => {
    expect(zoneReportedArea({ area: 5000 }, frame)).toEqual({ px: 5000, pct: 100 });
    expect(zoneReportedArea({ area: 2500 }, frame)).toEqual({ px: 2500, pct: 50 });
  });

  it('never divides by a frame that has not loaded yet', () => {
    expect(zoneReportedArea({ area: 5000 }, { width: 0, height: 0 })).toEqual({ px: 5000, pct: 0 });
  });

  it('trusts the backend even when the polygon disagrees', () => {
    // Live data: two zones with identical coords report different areas,
    // because Zones.Area is whatever ZoneMinder last wrote — that is exactly
    // the number legacy prints, so we print it too instead of recounting.
    expect(zoneReportedArea({ area: 9926 }, frame).px).toBe(9926);
  });
});

describe('zoneArea — the draft polygon in ZoneEditor', () => {
  it('reports pixels and percent of the frame for pixel zones', () => {
    expect(zoneArea({ units: 'Pixels', coords: '0,0 100,0 100,50 0,50' }, frame)).toEqual({ px: 5000, pct: 100 });
    expect(zoneArea({ units: 'Pixels', coords: '0,0 50,0 50,50 0,50' }, frame)).toEqual({ px: 2500, pct: 50 });
  });
  it('treats coords as pixels even when Units is Percent (Units only scales thresholds)', () => {
    expect(zoneArea({ units: 'Percent', coords: '0,0 100,0 100,50 0,50' }, frame)).toEqual({ px: 5000, pct: 100 });
  });
});

describe('bounds and colours', () => {
  it('flags a vertex outside the frame', () => {
    expect(zoneOutOfBounds({ units: 'Pixels', coords: '0,0 120,0 120,50 0,50' }, frame)).toBe(true);
    expect(zoneOutOfBounds({ units: 'Pixels', coords: '0,0 100,0 100,50 0,50' }, frame)).toBe(false);
  });
  it('overlay points are the stored pixel coords regardless of Units', () => {
    expect(zonePixelPoints({ units: 'Percent', coords: '50,25' }, frame)).toEqual([{ x: 50, y: 25 }]);
  });
  it('uses the legacy zone palette', () => {
    expect(zoneColour('Active')).toBe('#ff0000');
    expect(zoneColour('Privacy')).toBe('#000000');
    expect(zoneColour('Whatever')).toBe('#ffffff');
  });
});

describe('coordsArePercent / coordsToPixels — the two ways ZoneMinder stores a polygon', () => {
  it('reads integer coords as pixels, whatever Units says', () => {
    expect(coordsArePercent('0,0 100,0 100,50 0,50')).toBe(false);
    expect(coordsToPixels('0,0 100,0 100,50 0,50', frame)).toEqual([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 },
    ]);
  });

  it('reads the two-decimal form legacy 1.39.41 saves as percent of the frame', () => {
    const coords = '0.00,0.00 50.00,0.00 50.00,100.00 0.00,100.00';
    expect(coordsArePercent(coords)).toBe(true);
    expect(coordsToPixels(coords, frame)).toEqual([
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 },
    ]);
    expect(zoneArea({ units: 'Percent', coords }, frame)).toEqual({ px: 2500, pct: 50 });
  });

  it('treats decimals above 100 as pixels, as legacy\'s PHP does', () => {
    // Monitor 2's "All" zone on the dev box.
    expect(coordsArePercent('0.00,0.00 56.17,0.00 56.17,177.64 0.00,177.64')).toBe(false);
  });

  it('never flags a percent zone as outside the frame', () => {
    expect(zoneOutOfBounds({ units: 'Percent', coords: '0.00,0.00 100.00,0.00 100.00,100.00' }, frame)).toBe(false);
  });
});
