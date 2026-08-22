import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDocumentVisible } from './useDocumentVisible';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.useRealTimers();
});

describe('useDocumentVisible', () => {
  it('starts true and only flips false after the hidden delay', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDocumentVisible(1_000));
    expect(result.current).toBe(true);
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(false);
  });

  it('a quick return cancels the pending flip; returning later restores immediately', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDocumentVisible(1_000));
    act(() => setVisibility('hidden'));
    act(() => { vi.advanceTimersByTime(500); });
    act(() => setVisibility('visible'));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(true);

    act(() => setVisibility('hidden'));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(false);
    act(() => setVisibility('visible'));
    expect(result.current).toBe(true);
  });
});
