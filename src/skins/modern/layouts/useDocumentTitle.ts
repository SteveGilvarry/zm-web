import { useEffect } from 'react';

/**
 * Sets `document.title` to `${title} · ZoneMinder` while the caller is
 * mounted. Pass an already-translated string: `useDocumentTitle(t('Events'))`.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ZoneMinder`;
  }, [title]);
}
