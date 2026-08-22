import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { eventCombo, isEditableTarget, normalizeCombo, useHotkeys, type HotkeyMap } from './useHotkeys';

function Harness({ map, enabled = true }: { map: HotkeyMap; enabled?: boolean }) {
  useHotkeys(map, { enabled });
  return (
    <div>
      <input aria-label="text" />
      <input type="checkbox" aria-label="box" />
      <textarea aria-label="area" />
      <div contentEditable aria-label="rich" />
      <button type="button">ok</button>
    </div>
  );
}

describe('normalizeCombo / eventCombo', () => {
  it('canonicalises modifier order and case', () => {
    expect(normalizeCombo('Shift+Ctrl+K')).toBe('ctrl+shift+k');
    expect(normalizeCombo(' cmd + k ')).toBe('meta+k');
    expect(normalizeCombo('Left')).toBe('left');
  });

  it('names arrow, space, delete, escape and characters', () => {
    const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
      eventCombo({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
    expect(ev('ArrowLeft')).toBe('left');
    expect(ev('ArrowRight')).toBe('right');
    expect(ev(' ')).toBe('space');
    expect(ev('Delete')).toBe('delete');
    expect(ev('Escape')).toBe('escape');
    expect(ev('?', { shiftKey: true })).toBe('?');
    expect(ev('K', { shiftKey: true })).toBe('k');
    expect(ev('k', { ctrlKey: true })).toBe('ctrl+k');
    expect(ev('ArrowLeft', { shiftKey: true })).toBe('shift+left');
  });
});

describe('isEditableTarget', () => {
  it('flags text inputs, textareas and contenteditable but not buttons', () => {
    const { getByLabelText, getByRole } = render(<Harness map={{}} />);
    expect(isEditableTarget(getByLabelText('text'))).toBe(true);
    expect(isEditableTarget(getByLabelText('area'))).toBe(true);
    expect(isEditableTarget(getByLabelText('box'))).toBe(false);
    expect(isEditableTarget(getByRole('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('useHotkeys', () => {
  it('fires the matching handler on document keydown and prevents default', () => {
    const left = vi.fn();
    const space = vi.fn();
    const help = vi.fn();
    render(<Harness map={{ left, space, '?': help }} />);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    const ev = fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    expect(left).toHaveBeenCalledTimes(1);
    expect(space).toHaveBeenCalledTimes(1);
    expect(help).toHaveBeenCalledTimes(1);
    // fireEvent returns false when preventDefault was called.
    expect(ev).toBe(false);
  });

  it('ignores keys typed into inputs and textareas', () => {
    const del = vi.fn();
    const { getByLabelText } = render(<Harness map={{ delete: del }} />);
    fireEvent.keyDown(getByLabelText('text'), { key: 'Delete' });
    fireEvent.keyDown(getByLabelText('area'), { key: 'Delete' });
    expect(del).not.toHaveBeenCalled();
    fireEvent.keyDown(getByLabelText('box'), { key: 'Delete' });
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('skips events another handler already consumed', () => {
    const esc = vi.fn();
    render(<Harness map={{ escape: esc }} />);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ev.preventDefault();
    document.body.dispatchEvent(ev);
    expect(esc).not.toHaveBeenCalled();
  });

  it('detaches when disabled and on unmount', () => {
    const right = vi.fn();
    const { rerender, unmount } = render(<Harness map={{ right }} enabled={false} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(right).not.toHaveBeenCalled();
    rerender(<Harness map={{ right }} enabled />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(right).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(right).toHaveBeenCalledTimes(1);
  });

  it('uses the latest map without re-attaching', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = render(<Harness map={{ left: a }} />);
    rerender(<Harness map={{ left: b }} />);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
