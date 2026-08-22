import { describe, expect, it, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isTypingTarget, useEventHotkeys } from './useEventHotkeys';

describe('useEventHotkeys', () => {
  it('dispatches by key and prevents the default (Space must not scroll)', async () => {
    const onLeft = vi.fn();
    const onSpace = vi.fn();
    renderHook(() => useEventHotkeys({ ArrowLeft: onLeft, ' ': onSpace }));
    const user = userEvent.setup();

    await user.keyboard('{ArrowLeft}');
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onLeft.mock.calls[0][0].defaultPrevented).toBe(true);

    await user.keyboard(' ');
    expect(onSpace).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled or with a modifier held', async () => {
    const onLeft = vi.fn();
    const { rerender } = renderHook(({ on }) => useEventHotkeys({ ArrowLeft: onLeft }, on), {
      initialProps: { on: false },
    });
    const user = userEvent.setup();
    await user.keyboard('{ArrowLeft}');
    expect(onLeft).not.toHaveBeenCalled();

    rerender({ on: true });
    await user.keyboard('{Control>}{ArrowLeft}{/Control}');
    expect(onLeft).not.toHaveBeenCalled();
    await user.keyboard('{ArrowLeft}');
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('leaves keystrokes aimed at inputs alone', async () => {
    const onLeft = vi.fn();
    function Page() {
      useEventHotkeys({ ArrowLeft: onLeft });
      return <input aria-label="notes" />;
    }
    render(<Page />);
    const user = userEvent.setup();
    await user.click(document.querySelector('input')!);
    await user.keyboard('{ArrowLeft}');
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('lets a handler decline by returning false', async () => {
    let seen: KeyboardEvent | null = null;
    const handler = vi.fn((e: KeyboardEvent) => { seen = e; return false; });
    renderHook(() => useEventHotkeys({ Delete: handler }));
    const user = userEvent.setup();
    await user.keyboard('{Delete}');
    expect(handler).toHaveBeenCalled();
    expect(seen!.defaultPrevented).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('recognises form controls and contenteditable', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
