import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useInViewport } from './useInViewport';

/**
 * The global vitest.setup.ts stub for IntersectionObserver is a no-op (its
 * observe/unobserve/disconnect do nothing and it never fires). For these
 * tests we replace it with a controllable mock that captures the callback
 * and constructor options so we can synthesise entries.
 */

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

interface MockInstance {
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: (isIntersecting: boolean) => void;
  options: IntersectionObserverInit | undefined;
}

function installIOMock(): { instances: MockInstance[] } {
  const instances: MockInstance[] = [];

  class FakeIO {
    private callback: IOCallback;
    constructor(cb: IOCallback, options?: IntersectionObserverInit) {
      this.callback = cb;
      const instance: MockInstance = {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
        trigger: (isIntersecting: boolean) =>
          this.callback([{ isIntersecting } as IntersectionObserverEntry]),
        options,
      };
      instances.push(instance);
      this.observe = instance.observe;
      this.unobserve = instance.unobserve;
      this.disconnect = instance.disconnect;
    }
    observe: (el: Element) => void;
    unobserve: (el: Element) => void;
    disconnect: () => void;
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  vi.stubGlobal('IntersectionObserver', FakeIO);
  return { instances };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeRefWithElement<T extends Element = HTMLDivElement>(): React.RefObject<T | null> {
  const ref = createRef<T>();
  // Hand the ref a real element so the effect actually constructs an observer.
  (ref as { current: T | null }).current = document.createElement('div') as unknown as T;
  return ref;
}

describe('useInViewport — initial state', () => {
  it('returns false before any intersection event fires', () => {
    installIOMock();
    const ref = makeRefWithElement();
    const { result } = renderHook(() => useInViewport(ref));
    expect(result.current).toBe(false);
  });
});

describe('useInViewport — observer callback drives state', () => {
  it('returns true when the observer reports isIntersecting=true', () => {
    const { instances } = installIOMock();
    const ref = makeRefWithElement();
    const { result } = renderHook(() => useInViewport(ref));

    expect(instances).toHaveLength(1);
    act(() => instances[0].trigger(true));
    expect(result.current).toBe(true);
  });

  it('returns false again when the element leaves the viewport', () => {
    const { instances } = installIOMock();
    const ref = makeRefWithElement();
    const { result } = renderHook(() => useInViewport(ref));

    act(() => instances[0].trigger(true));
    expect(result.current).toBe(true);
    act(() => instances[0].trigger(false));
    expect(result.current).toBe(false);
  });
});

describe('useInViewport — observer wiring', () => {
  it('forwards rootMargin to the IntersectionObserver constructor', () => {
    const { instances } = installIOMock();
    const ref = makeRefWithElement();
    renderHook(() => useInViewport(ref, '200px'));

    expect(instances).toHaveLength(1);
    expect(instances[0].options?.rootMargin).toBe('200px');
  });

  it('observe() is called with the element from the ref', () => {
    const { instances } = installIOMock();
    const ref = makeRefWithElement();
    renderHook(() => useInViewport(ref));

    expect(instances[0].observe).toHaveBeenCalledTimes(1);
    expect(instances[0].observe).toHaveBeenCalledWith(ref.current);
  });

  it('disconnects the observer on unmount', () => {
    const { instances } = installIOMock();
    const ref = makeRefWithElement();
    const { unmount } = renderHook(() => useInViewport(ref));

    expect(instances[0].disconnect).not.toHaveBeenCalled();
    unmount();
    expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not construct an observer when ref.current is null', () => {
    const { instances } = installIOMock();
    const emptyRef = createRef<HTMLDivElement>();
    renderHook(() => useInViewport(emptyRef));
    expect(instances).toHaveLength(0);
  });
});
