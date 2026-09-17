/**
 * `ZM_WEB_VIEWING_TIMEOUT` (watch.js:1117-1150): stop the stream after a
 * quiet period, ask whether anyone is still watching, resume on the answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewingTimeout } from './useViewingTimeout';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup(over: Partial<Parameters<typeof useViewingTimeout>[0]> = {}) {
  const onIdle = vi.fn();
  const onResume = vi.fn();
  const view = renderHook((props: { enabled: boolean }) => useViewingTimeout({
    enabled: props.enabled, timeoutS: 60, onIdle, onResume, ...over,
  }), { initialProps: { enabled: true } });
  return { ...view, onIdle, onResume };
}

describe('useViewingTimeout', () => {
  it('stops the stream and prompts once the timeout passes', () => {
    const { result, onIdle } = setup();
    expect(result.current.prompted).toBe(false);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(result.current.prompted).toBe(true);
  });

  it('is pushed back by pointer and key activity', () => {
    const { result, onIdle } = setup();
    act(() => { vi.advanceTimersByTime(50_000); });
    act(() => { document.dispatchEvent(new MouseEvent('mousemove')); });
    act(() => { vi.advanceTimersByTime(50_000); });
    expect(onIdle).not.toHaveBeenCalled();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });
    act(() => { vi.advanceTimersByTime(59_000); });
    expect(result.current.prompted).toBe(false);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resumes and re-arms on the answer', () => {
    const { result, onIdle, onResume } = setup();
    act(() => { vi.advanceTimersByTime(60_000); });
    act(() => { result.current.resume(); });
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(result.current.prompted).toBe(false);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it('never fires while nothing is playing or the setting is off', () => {
    const idle = setup({ timeoutS: 0 });
    act(() => { vi.advanceTimersByTime(600_000); });
    expect(idle.onIdle).not.toHaveBeenCalled();

    const off = setup();
    off.rerender({ enabled: false });
    act(() => { vi.advanceTimersByTime(600_000); });
    expect(off.onIdle).not.toHaveBeenCalled();
  });
});
