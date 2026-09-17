/**
 * The classic Back button's enable test. Legacy uses `document.referrer`,
 * which an SPA leaves empty however deep you navigate — so this hook asks the
 * router instead.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const routerCanGoBack = vi.fn(() => false);
vi.mock('@tanstack/react-router', () => ({ useCanGoBack: () => routerCanGoBack() }));

const { useCanGoBack } = await import('./useCanGoBack');

function setHistoryLength(n: number) {
  Object.defineProperty(window.history, 'length', { value: n, configurable: true });
}

afterEach(() => {
  routerCanGoBack.mockReturnValue(false);
  setHistoryLength(1);
});

describe('useCanGoBack', () => {
  it('is false on a page nothing linked to', () => {
    setHistoryLength(1);
    const { result } = renderHook(() => useCanGoBack());
    expect(result.current).toBe(false);
  });

  it('is true after in-app navigation, where document.referrer stays empty', () => {
    setHistoryLength(1);
    expect(document.referrer).toBe('');
    routerCanGoBack.mockReturnValue(true);
    const { result } = renderHook(() => useCanGoBack());
    expect(result.current).toBe(true);
  });

  it('is true on a full page load into a tab that already has history', () => {
    // A reload, or arriving from another site: the router's own index is 0
    // but `window.history.back()` still has somewhere to go.
    routerCanGoBack.mockReturnValue(false);
    setHistoryLength(3);
    const { result } = renderHook(() => useCanGoBack());
    expect(result.current).toBe(true);
  });
});
