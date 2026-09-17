/**
 * Legacy `openFullscreen` / `closeFullscreen` (skin.js): one call flips the
 * element in or out of fullscreen. Browsers reject the request outside a user
 * gesture; the rejection is swallowed because the button simply does nothing
 * then, as it does in legacy.
 */
export function toggleFullscreen(el: HTMLElement | null): void {
  if (!el) return;
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  el.requestFullscreen?.().catch(() => {});
}
