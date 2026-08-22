import { useEffect } from 'react';
import { useZmConfig } from '@/features/config/useZmConfig';

export const DEFAULT_WEB_TITLE = 'ZoneMinder';
export const DEFAULT_WEB_TITLE_PREFIX = 'ZM';

/** Legacy `<title>`: `ZM_WEB_TITLE_PREFIX - <view>`; the brand alone when there is no view. */
export function formatSiteTitle(prefix: string, page?: string): string {
  const p = prefix.trim() || DEFAULT_WEB_TITLE_PREFIX;
  return page ? `${p} - ${page}` : p;
}

/**
 * `ZM_WEB_TITLE` / `ZM_WEB_TITLE_PREFIX` as the operator set them in
 * Options → Web. Pass the translated page name to also set
 * `document.title` the way legacy `xhtmlHeaders()` does.
 *
 *   const { title } = useSiteTitle(t('Events'));   // document.title = "ZM - Events"
 */
export function useSiteTitle(page?: string): { title: string; prefix: string } {
  const title = useZmConfig('ZM_WEB_TITLE', DEFAULT_WEB_TITLE);
  const prefix = useZmConfig('ZM_WEB_TITLE_PREFIX', DEFAULT_WEB_TITLE_PREFIX);
  useEffect(() => {
    if (!page) return;
    document.title = formatSiteTitle(prefix, page);
  }, [prefix, page]);
  return { title: title.trim() || DEFAULT_WEB_TITLE, prefix: prefix.trim() || DEFAULT_WEB_TITLE_PREFIX };
}
