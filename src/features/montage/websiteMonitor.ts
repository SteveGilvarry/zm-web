import type { Monitor } from '@/types';

/**
 * ZoneMinder's `WebSite` monitor type — a web page, not a camera. Legacy
 * embeds it (`Monitor::getStreamHTML` → `getWebSiteUrl`) instead of asking
 * zms for a stream.
 */
export function isWebsiteMonitor(monitor: Pick<Monitor, 'type'>): boolean {
  return monitor.type === 'WebSite';
}
