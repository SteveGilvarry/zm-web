import { useEffect, useState } from 'react';
import { getMonitorSnapshotUrl } from '@/api/monitors';
import { getAuthToken } from '@/api/client';

const REFRESH_INTERVAL_MS = 4_000;

/**
 * Returns a monitor snapshot URL that refreshes on an interval — but only
 * while `active`. When inactive the URL is frozen (the last image stays
 * visible); refresh is also skipped while the tab is hidden.
 *
 * Returns an empty string until the first refresh, so a card that is never
 * scrolled into view issues zero network requests.
 */
export function useRefreshingSnapshot(monitorId: number, active: boolean): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!active) return;

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      // Re-read the token each tick so it stays valid as it rotates.
      const base = getMonitorSnapshotUrl(monitorId, getAuthToken() ?? undefined);
      const sep = base.includes('?') ? '&' : '?';
      setUrl(`${base}${sep}t=${Date.now()}`);
    };

    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [monitorId, active]);

  return url;
}
