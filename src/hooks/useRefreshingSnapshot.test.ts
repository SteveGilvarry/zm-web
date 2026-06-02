import { describe, expect, it, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { useRefreshingSnapshot } from './useRefreshingSnapshot';

/**
 * useRefreshingSnapshot polls a snapshot URL on a 4 s interval when active.
 * It returns an empty string until the first tick — so the very first thing
 * the test sees is `''` and the subsequent value contains a `t=` cache-buster.
 *
 * Fake timers drive both setInterval and the synchronous initial `refresh()`
 * call inside the effect.
 */

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    user: null,
    isAuthenticated: true,
  });
});

afterAll(() => {
  useAuthStore.getState().clearAuth();
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRefreshingSnapshot — inactive state', () => {
  it('returns an empty string when active=false', () => {
    const { result } = renderHook(() => useRefreshingSnapshot(1, false));
    expect(result.current).toBe('');
  });

  it('does not advance the URL when inactive even after timers tick', () => {
    const { result } = renderHook(() => useRefreshingSnapshot(1, false));
    expect(result.current).toBe('');
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current).toBe('');
  });
});

describe('useRefreshingSnapshot — active state', () => {
  it('synchronously sets a URL once active=true', () => {
    const { result } = renderHook(() => useRefreshingSnapshot(42, true));
    // The hook's effect calls refresh() once synchronously after mount.
    expect(result.current).not.toBe('');
    expect(result.current).toContain('/api/v3/monitors/42/snapshot');
    expect(result.current).toMatch(/[?&]t=\d+/);
  });

  it('embeds the access token from the auth store in the URL', () => {
    const { result } = renderHook(() => useRefreshingSnapshot(42, true));
    expect(result.current).toContain('token=test-token');
  });

  it('produces a new cache-busted URL on each interval tick', () => {
    const { result } = renderHook(() => useRefreshingSnapshot(42, true));
    const first = result.current;
    expect(first).not.toBe('');

    // Advance Date.now so the `t=` cache buster differs deterministically.
    act(() => { vi.advanceTimersByTime(4_000); });
    const second = result.current;
    expect(second).not.toBe(first);
    expect(second).toMatch(/[?&]t=\d+/);

    act(() => { vi.advanceTimersByTime(4_000); });
    const third = result.current;
    expect(third).not.toBe(second);
  });
});

describe('useRefreshingSnapshot — cleanup', () => {
  it('stops polling on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useRefreshingSnapshot(42, true),
    );
    const lastBeforeUnmount = result.current;
    unmount();
    // Tick forward — the unmounted hook can no longer push a new value.
    act(() => { vi.advanceTimersByTime(20_000); });
    // The captured `result.current` from after unmount is the last value the
    // hook produced; no setState fires post-unmount.
    expect(result.current).toBe(lastBeforeUnmount);
  });

  it('stops polling when active flips from true to false', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useRefreshingSnapshot(42, active),
      { initialProps: { active: true } },
    );
    const firstActive = result.current;
    expect(firstActive).not.toBe('');

    rerender({ active: false });
    // After inactive, no further URL updates fire even with timer advances.
    const afterDisable = result.current;
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current).toBe(afterDisable);
  });
});

describe('useRefreshingSnapshot — visibility gating', () => {
  it('skips a refresh tick while the document is hidden', () => {
    const { result } = renderHook(() => useRefreshingSnapshot(42, true));
    const initial = result.current;
    expect(initial).not.toBe('');

    // Hide the document so the interval tick early-returns.
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get');
    visibilitySpy.mockReturnValue('hidden');

    act(() => { vi.advanceTimersByTime(4_000); });
    expect(result.current).toBe(initial);

    visibilitySpy.mockRestore();
  });
});
