/**
 * Polygon self-intersection, ported from ZoneMinder's `isSelfIntersecting()`
 * / `linesIntersect()` (`web/includes/functions.php:1294,1383`).
 */
import { describe, expect, it } from 'vitest';
import { isSelfIntersecting, segmentsIntersect } from './selfIntersects';

const p = (x: number, y: number) => ({ x, y });

describe('segmentsIntersect', () => {
  it('sees a plain crossing', () => {
    expect(segmentsIntersect([p(0, 0), p(10, 10)], [p(0, 10), p(10, 0)])).toBe(true);
  });

  it('rejects segments whose bounding boxes miss each other', () => {
    expect(segmentsIntersect([p(0, 0), p(1, 1)], [p(5, 5), p(6, 6)])).toBe(false);
  });

  it('rejects a crossing that only happens past the ends', () => {
    expect(segmentsIntersect([p(0, 0), p(2, 0)], [p(5, -5), p(5, 5)])).toBe(false);
  });

  it('counts touching endpoints and collinear overlap, as legacy does', () => {
    expect(segmentsIntersect([p(0, 0), p(5, 0)], [p(5, 0), p(5, 5)])).toBe(true);
    expect(segmentsIntersect([p(0, 0), p(10, 0)], [p(5, 0), p(15, 0)])).toBe(true);
  });

  it('keeps parallel non-collinear segments apart', () => {
    expect(segmentsIntersect([p(0, 0), p(10, 0)], [p(0, 1), p(10, 1)])).toBe(false);
  });
});

describe('isSelfIntersecting', () => {
  it('passes a convex quad and a concave but simple polygon', () => {
    expect(isSelfIntersecting([p(0, 0), p(10, 0), p(10, 10), p(0, 10)])).toBe(false);
    expect(isSelfIntersecting([p(0, 0), p(10, 0), p(5, 5), p(10, 10), p(0, 10)])).toBe(false);
  });

  it('catches the classic bow tie', () => {
    expect(isSelfIntersecting([p(0, 0), p(10, 0), p(0, 10), p(10, 10)])).toBe(true);
  });

  it('never complains about a triangle or fewer points', () => {
    expect(isSelfIntersecting([p(0, 0), p(10, 0), p(5, 9)])).toBe(false);
    expect(isSelfIntersecting([p(0, 0), p(10, 0)])).toBe(false);
    expect(isSelfIntersecting([])).toBe(false);
  });

  it('catches a spur that doubles back across an earlier edge', () => {
    expect(isSelfIntersecting([
      p(0, 0), p(10, 0), p(10, 10), p(5, -5), p(0, 10),
    ])).toBe(true);
  });
});
