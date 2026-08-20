import { describe, expect, it } from 'vitest';
import { pageNumbers } from './pageNumbers';

describe('pageNumbers', () => {
  it('lists every page when there are few', () => {
    expect(pageNumbers(2, 4)).toEqual([1, 2, 3, 4]);
  });
  it('windows around the current page with gaps', () => {
    expect(pageNumbers(6, 20)).toEqual([1, null, 4, 5, 6, 7, 8, null, 20]);
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, null, 20]);
    expect(pageNumbers(20, 20)).toEqual([1, null, 18, 19, 20]);
  });
});
