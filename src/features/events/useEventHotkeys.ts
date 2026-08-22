import { useEffect, useRef } from 'react';

/**
 * Map of `KeyboardEvent.key` → handler. A handler returning `false` leaves
 * the event alone; anything else (including `undefined`) marks it handled
 * and `preventDefault()` runs, so Space does not scroll the page.
 */
export type HotkeyBindings = Record<string, (e: KeyboardEvent) => void | boolean>;

/** True when the event comes from something that consumes typing itself. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Page-level keyboard shortcuts for the event detail page (legacy
 * `?view=event`: ←/→ prev/next, Space play/pause, Delete). Listens on
 * `window`, ignores keystrokes aimed at form controls, and is a no-op while
 * `enabled` is false (a dialog is open, the event has not loaded).
 *
 * Minimal local equivalent of the shared `useHotkeys` planned for
 * `src/features/nav`; swap to that once it lands.
 */
export function useEventHotkeys(bindings: HotkeyBindings, enabled = true): void {
  // Keep the latest handlers without re-subscribing on every render.
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const handler = latest.current[e.key];
      if (!handler) return;
      if (handler(e) === false) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
