import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BULK_CHUNK_SIZE, fanOut, useBulkFanOut } from './bulkFanOut';

describe('fanOut', () => {
  it('runs every id and keeps going past a failure', async () => {
    const seen: number[] = [];
    const run = vi.fn(async (id: number) => {
      seen.push(id);
      if (id === 2) throw new Error('HTTP 404');
    });
    const progress: Array<[number, number]> = [];
    const failed = await fanOut([1, 2, 3], run, (done, f) => progress.push([done, f.length]));

    expect(seen).toEqual([1, 2, 3]);
    expect(failed).toEqual([{ id: 2, message: 'HTTP 404' }]);
    expect(progress).toEqual([[3, 1]]);
  });

  it('sends ten at a time, like legacy eids[] chunks, and reports after each chunk', async () => {
    let inFlight = 0;
    let peak = 0;
    const run = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });
    const progress: number[] = [];
    const ids = Array.from({ length: 25 }, (_, i) => i + 1);
    await fanOut(ids, run, (done) => progress.push(done));

    expect(run).toHaveBeenCalledTimes(25);
    expect(peak).toBe(BULK_CHUNK_SIZE);
    expect(progress).toEqual([10, 20, 25]);
  });

  it('stringifies non-Error rejections', async () => {
    const failed = await fanOut([7], () => Promise.reject('nope'));
    expect(failed).toEqual([{ id: 7, message: 'nope' }]);
  });
});

describe('useBulkFanOut', () => {
  it('tracks running state and ends with the failures and action label', async () => {
    const { result } = renderHook(() => useBulkFanOut());
    expect(result.current.progress.running).toBe(false);

    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.start('Archive', [1, 2], async (id) => {
        if (id === 1) await gate;
        if (id === 2) throw new Error('boom');
      });
    });
    expect(result.current.progress).toMatchObject({ action: 'Archive', running: true, done: 0, total: 2 });

    await act(async () => { release(); await promise; });
    expect(result.current.progress).toEqual({
      action: 'Archive', running: false, done: 2, total: 2,
      failed: [{ id: 2, message: 'boom' }],
    });

    act(() => result.current.dismiss());
    expect(result.current.progress.action).toBeNull();
  });
});
