import { describe, expect, it } from 'vitest';
import { PAGE_SIZE_ALL, pageCount, pageNumbers, pageWindow } from './paginationMath';

describe('classic pagination helpers', () => {
  it('counts pages, treating All as one page', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(500, PAGE_SIZE_ALL)).toBe(1);
  });
  it('computes the "Showing X to Y of Z rows" window', () => {
    expect(pageWindow(1, 25, 7)).toEqual({ from: 1, to: 7 });
    expect(pageWindow(2, 25, 30)).toEqual({ from: 26, to: 30 });
    expect(pageWindow(1, PAGE_SIZE_ALL, 30)).toEqual({ from: 1, to: 30 });
    expect(pageWindow(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });
  it('lists every page when few, else first/last plus a window with gaps', () => {
    expect(pageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(5, 20)).toEqual([1, '…', 4, 5, 6, '…', 20]);
    expect(pageNumbers(1, 20)).toEqual([1, 2, '…', 20]);
  });
});
