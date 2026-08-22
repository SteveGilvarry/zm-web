import { describe, expect, it } from 'vitest';
import { polygonArea, zoneArea, zoneColour, zoneOutOfBounds, zonePixelPoints, zoneReportedArea } from './zoneArea';

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
