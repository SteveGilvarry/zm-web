/**
 * `useIsFullscreen` only ever reads `document.fullscreenElement` when the
 * document fires `fullscreenchange`; these tests drive that event by hand.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIsFullscreen } from './useIsFullscreen';

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
}

function fireChange() {
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

afterEach(() => setFullscreenElement(null));

describe('useIsFullscreen', () => {
  it('turns on when the ref is the fullscreen element and off when another element is', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useIsFullscreen({ current: el }));
    expect(result.current).toBe(false);

    setFullscreenElement(el);
    fireChange();
    expect(result.current).toBe(true);

    setFullscreenElement(document.body);
    fireChange();
    expect(result.current).toBe(false);
  });

  it('stays off while the ref is empty, whatever is fullscreen', () => {
    const { result } = renderHook(() => useIsFullscreen({ current: null }));
    setFullscreenElement(document.body);
    fireChange();
    expect(result.current).toBe(false);
  });

  it('stops listening after unmount', () => {
    const el = document.createElement('div');
    const { result, unmount } = renderHook(() => useIsFullscreen({ current: el }));
    unmount();
    setFullscreenElement(el);
    fireChange();
    expect(result.current).toBe(false);
  });
});
