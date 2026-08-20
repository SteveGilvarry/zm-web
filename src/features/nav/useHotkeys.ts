import { useEffect, useRef } from 'react';

export type HotkeyHandler = (event: KeyboardEvent) => void;

/**
 * Key names the map accepts. Single characters are lower-case (`'a'`, `'?'`,
 * `'/'`); named keys are `left`, `right`, `up`, `down`, `space`, `delete`,
 * `escape`, `enter`, `tab`, `home`, `end`. Prefix with `ctrl+`, `meta+`,
 * `alt+`, `shift+` for chords (`'ctrl+k'`). `shift` is implied for
 * characters that need it (`?` is `?`, not `shift+?`).
 */
export type HotkeyMap = Record<string, HotkeyHandler>;

export interface HotkeyOptions {
  /** Detach without unmounting the caller (default true). */
  enabled?: boolean;
  /** Call `preventDefault()` on handled keys (default true; stops Space from
   *  scrolling and Delete/Backspace from navigating back in old browsers). */
  preventDefault?: boolean;
}

const NAMED: Record<string, string> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ' ': 'space',
  Spacebar: 'space',
  Delete: 'delete',
  Del: 'delete',
  Escape: 'escape',
  Esc: 'escape',
  Enter: 'enter',
  Tab: 'tab',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
};

/** `'Ctrl+K'`, `' ctrl + k '` → `'ctrl+k'`; modifiers in canonical order. */
export function normalizeCombo(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const key = parts.pop() ?? '';
  const mods = new Set(parts);
  const out: string[] = [];
  if (mods.has('ctrl') || mods.has('control')) out.push('ctrl');
  if (mods.has('meta') || mods.has('cmd') || mods.has('command')) out.push('meta');
  if (mods.has('alt') || mods.has('option')) out.push('alt');
  if (mods.has('shift')) out.push('shift');
  out.push(key);
  return out.join('+');
}

/** The combo string a keyboard event represents, in the same canonical form. */
export function eventCombo(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string {
  const named = NAMED[e.key];
  const key = named ?? (e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
  const out: string[] = [];
  if (e.ctrlKey) out.push('ctrl');
  if (e.metaKey) out.push('meta');
  if (e.altKey) out.push('alt');
  // Shift is part of the identity of named keys (`shift+left`) but already
  // baked into printable characters (`?`, `A`), so it is dropped for those.
  if (e.shiftKey && (named || e.key.length !== 1)) out.push('shift');
  out.push(key);
  return out.join('+');
}

/** Typing targets: inputs, textareas, selects, contenteditable regions. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  // jsdom leaves `isContentEditable` undefined; fall back to the attribute.
  if (target.isContentEditable === true) return true;
  const attr = target.getAttribute('contenteditable');
  return attr === '' || attr === 'true' || attr === 'plaintext-only';
}

/**
 * Document-level keyboard shortcuts.
 *
 *   useHotkeys({
 *     left: () => goPrev(),
 *     right: () => goNext(),
 *     space: () => togglePlay(),
 *     delete: () => askDelete(),
 *     escape: () => close(),
 *     '?': () => showHelp(),
 *   });
 *
 * Ignored while focus is in a text field, when another handler already
 * called `preventDefault()` (a modal's own Escape, say), and when an IME
 * composition is in progress. The map may be a fresh object every render;
 * the listener is attached once per `enabled` change.
 */
export function useHotkeys(map: HotkeyMap, options: HotkeyOptions = {}): void {
  const { enabled = true, preventDefault = true } = options;
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (isEditableTarget(e.target)) return;
      const combo = eventCombo(e);
      const entry = Object.entries(mapRef.current).find(([k]) => normalizeCombo(k) === combo);
      if (!entry) return;
      if (preventDefault) e.preventDefault();
      entry[1](e);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, preventDefault]);
}
