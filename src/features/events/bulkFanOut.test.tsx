import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fanOut, useBulkFanOut } from './bulkFanOut';

describe('fanOut', () => {
  it('runs every id in order and keeps going past a failure', async () => {
    const seen: number[] = [];
    const run = vi.fn(async (id: number) => {
      seen.push(id);
      if (id === 2) throw new Error('HTTP 404');
    });
    const progress: Array<[number, number]> = [];
    const failed = await fanOut([1, 2, 3], run, (done, f) => progress.push([done, f.length]));

    expect(seen).toEqual([1, 2, 3]);
    expect(failed).toEqual([{ id: 2, message: 'HTTP 404' }]);
    expect(progress).toEqual([[1, 0], [2, 1], [3, 1]]);
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
