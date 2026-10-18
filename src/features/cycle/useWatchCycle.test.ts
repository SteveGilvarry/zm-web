/**
 * The watch page's cycle sidebar: the period list (watch.php:340-360 offers
 * six values and adds `ZM_WEB_REFRESH_CYCLE` when it is not already one of
 * them) and the rotation itself, which drives a route navigation rather than
 * swapping the stream in place.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Monitor } from '@/types';
import { useWatchPrefsStore } from '@/stores/watchPrefs';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/features/config/useZmConfig', () => ({
  useZmConfig: (_name: string, fallback: unknown) => fallback,
}));

const { watchCyclePeriods, WATCH_CYCLE_PERIODS, useWatchCycle } = await import('./useWatchCycle');

const m = (id: number): Monitor =>
  ({ id, name: `Cam ${id}`, capturing: 'Always', width: 1920, height: 1080, orientation: 'ROTATE_0' }) as unknown as Monitor;

afterEach(() => {
  useWatchPrefsStore.setState({ cyclePeriodS: null });
  navigate.mockClear();
  vi.useRealTimers();
});

describe('watchCyclePeriods', () => {
  it('offers the six legacy periods', () => {
    expect(watchCyclePeriods(30)).toEqual([...WATCH_CYCLE_PERIODS]);
    expect(WATCH_CYCLE_PERIODS).toEqual([5, 10, 30, 60, 120, 300]);
  });

  it('appends a configured refresh cycle that is not already listed', () => {
    expect(watchCyclePeriods(45)).toEqual([5, 10, 30, 60, 120, 300, 45]);
  });

  it('ignores an unset or nonsensical config value', () => {
    expect(watchCyclePeriods(0)).toEqual([...WATCH_CYCLE_PERIODS]);
    expect(watchCyclePeriods(-1)).toEqual([...WATCH_CYCLE_PERIODS]);
  });
});

describe('useWatchCycle — rotation', () => {
  it('counts down and navigates to the next monitor when it reaches zero', () => {
    vi.useFakeTimers();
    // The page rebuilds this list every render (it is a `.filter()` over the
    // filter row's survivors); the rotation must survive that.
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useWatchCycle(id, [m(1), m(2), m(3)].map((x) => ({ ...x })), true, { autoStart: true }),
      { initialProps: { id: 1 } },
    );

    expect(result.current.isPaused).toBe(false);
    expect(result.current.countdown).toBe(10);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(result.current.countdown).toBe(7);

    act(() => { vi.advanceTimersByTime(7_000); });
    expect(navigate).toHaveBeenCalledWith({
      to: '/monitors/$monitorId',
      params: { monitorId: '2' },
    });

    // The route lands, and the rotation keeps walking from there.
    rerender({ id: 2 });
    navigate.mockClear();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(navigate).toHaveBeenCalledWith({
      to: '/monitors/$monitorId',
      params: { monitorId: '3' },
    });
  });

  it('stops when the sidebar is closed and asks for no navigation', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWatchCycle(1, [m(1), m(2)], false));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.countdown).toBe(10);
  });

  it('holds still while paused', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWatchCycle(1, [m(1), m(2)], true, { autoStart: true }));
    act(() => result.current.togglePause());
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current.isPaused).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens paused unless the page asked for cycle=true', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWatchCycle(1, [m(1), m(2)], true));
    expect(result.current.isPaused).toBe(true);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(navigate).not.toHaveBeenCalled();
    act(() => result.current.togglePause());
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId', params: { monitorId: '2' } });
  });

  it('only counts down while the stream is playing', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ playing }: { playing: boolean }) => useWatchCycle(1, [m(1), m(2)], true, { autoStart: true, playing }),
      { initialProps: { playing: false } },
    );
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.countdown).toBe(10);
    rerender({ playing: true });
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(result.current.countdown).toBe(6);
    // Stopped again (idle prompt, hidden tab, Stop): the number holds.
    rerender({ playing: false });
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.countdown).toBe(6);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('skips a monitor whose stream failed', () => {
    vi.useFakeTimers();
    renderHook(() => useWatchCycle(1, [m(1), m(2)], true, { autoStart: true, playing: false, failed: true }));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId', params: { monitorId: '2' } });
  });

  it('stops the rotation when a monitor pill is clicked', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWatchCycle(1, [m(1), m(2), m(3)], true, { autoStart: true }));
    act(() => result.current.jumpTo(2));
    expect(result.current.isPaused).toBe(true);
    expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId', params: { monitorId: '3' } });
    navigate.mockClear();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('remembers the period across mounts, as zmCyclePeriod does', () => {
    const first = renderHook(() => useWatchCycle(1, [m(1), m(2)], true));
    act(() => first.result.current.setInterval(30));
    first.unmount();
    expect(useWatchPrefsStore.getState().cyclePeriodS).toBe(30);
    const second = renderHook(() => useWatchCycle(1, [m(1), m(2)], true));
    expect(second.result.current.intervalS).toBe(30);
  });

  it('follows a navigation it did not make instead of bouncing back', () => {
    vi.useFakeTimers();
    const list = [m(1), m(2), m(3)];
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useWatchCycle(id, list, true, { autoStart: true }),
      { initialProps: { id: 1 } },
    );
    rerender({ id: 3 });
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.current?.id).toBe(3);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId', params: { monitorId: '1' } });
  });
});
