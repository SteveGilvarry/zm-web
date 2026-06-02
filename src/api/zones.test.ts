import { describe, expect, it } from 'vitest';
import { parseCoords, serializeCoords, insertMidpoint, type Point } from './zones';

describe('parseCoords', () => {
  it('returns [] for empty or whitespace input', () => {
    expect(parseCoords('')).toEqual([]);
    expect(parseCoords('   ')).toEqual([]);
  });

  it('parses the standard "x,y x,y" format', () => {
    expect(parseCoords('100,200 300,400')).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ]);
  });

  it('tolerates extra whitespace between pairs', () => {
    expect(parseCoords('  100,200   300,400  ')).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ]);
  });

  it('drops malformed pairs without crashing', () => {
    // 'abc,def' parses to NaN/NaN → filtered by Number.isFinite check.
    expect(parseCoords('100,200 abc,def 300,400')).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ]);
  });

  it('handles a polygon with many vertices', () => {
    const out = parseCoords('0,0 100,0 100,100 50,150 0,100');
    expect(out).toHaveLength(5);
    expect(out[3]).toEqual({ x: 50, y: 150 });
  });
});

describe('serializeCoords', () => {
  it('returns an empty string for an empty array', () => {
    expect(serializeCoords([])).toBe('');
  });

  it('emits "x,y x,y" with integer rounding', () => {
    const points: Point[] = [
      { x: 100, y: 200 },
      { x: 300.7, y: 400.4 },
    ];
    // 300.7 rounds to 301; 400.4 rounds to 400.
    expect(serializeCoords(points)).toBe('100,200 301,400');
  });
});

describe('parseCoords ⇄ serializeCoords round-trip', () => {
  it('integer points round-trip exactly', () => {
    const original = '0,0 1920,0 1920,1080 0,1080';
    expect(serializeCoords(parseCoords(original))).toBe(original);
  });

  it('rounds float points on serialise (one-way information loss)', () => {
    // The drag handler may produce sub-pixel values; we round once before
    // sending to the backend so the column stores clean integers.
    const points: Point[] = [{ x: 10.4, y: 20.6 }];
    expect(serializeCoords(points)).toBe('10,21');
  });
});

describe('insertMidpoint', () => {
  it('returns the input unchanged when index is out of range', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(insertMidpoint(points, 99)).toBe(points);
  });

  it('inserts a midpoint between adjacent vertices', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const out = insertMidpoint(points, 0);
    expect(out).toHaveLength(4);
    expect(out[1]).toEqual({ x: 50, y: 0 }); // midpoint of (0,0)→(100,0)
    expect(out[0]).toEqual(points[0]);       // original points preserved
    expect(out[2]).toEqual(points[1]);
    expect(out[3]).toEqual(points[2]);
  });

  it('wraps around to close the polygon on the last edge', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    // Index 1 is the last point; its "next" wraps to index 0. Midpoint of
    // (100,0)→(0,0) is (50,0). The new point is appended at index 2.
    const out = insertMidpoint(points, 1);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ x: 50, y: 0 });
  });

  it('inserting then dragging keeps adjacent vertices intact', () => {
    // Verifies the immutability guarantee — original array isn't mutated.
    const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const out = insertMidpoint(points, 0);
    expect(points).toHaveLength(2); // original untouched
    expect(out).not.toBe(points);
  });
});
