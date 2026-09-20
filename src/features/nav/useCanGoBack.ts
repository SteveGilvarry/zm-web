import { useCanGoBack as useRouterCanGoBack } from '@tanstack/react-router';

/**
 * Whether the classic Back button has anywhere to go.
 *
 * Legacy greys `#backBtn` on `!document.referrer.length` (e.g.
 * `views/js/monitor.js:267`, `views/js/events.js`) — every legacy view is a
 * full page load, so the referrer *is* "the page you came from". In an SPA it
 * is not: in-app navigation leaves `document.referrer` at whatever loaded the
 * tab, which for a bookmark or a typed URL is the empty string, so the button
 * stayed dead however deep you were in the app.
 *
 * The router's own history index answers the real question. The extra
 * `history.length` test covers the other direction: a full page load into a
 * tab that already has entries behind it (a reload, or arriving from another
 * site) — `window.history.back()` will go somewhere, so the button should be
 * live even though the router's index is 0.
 */
export function useCanGoBack(): boolean {
  const routerCanGoBack = useRouterCanGoBack();
  return routerCanGoBack || (typeof window !== 'undefined' && window.history.length > 1);
}
