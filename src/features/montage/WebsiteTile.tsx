import { useTranslation } from 'react-i18next';
import type { Monitor } from '@/types';

/**
 * A WebSite monitor's tile. Legacy embeds the configured URL with
 * `getWebSiteUrl()` (an `<object>`); an iframe is the same thing with a
 * sandbox. A site that sends `X-Frame-Options` will refuse to render —
 * legacy warns about exactly that.
 */
export function WebsiteTile({ monitor }: { monitor: Monitor }) {
  const { t } = useTranslation();
  const url = monitor.path?.trim();
  if (!url) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
        {t('No web site configured for this monitor.')}
      </div>
    );
  }
  return (
    <iframe
      src={url}
      title={monitor.name}
      data-testid={`website-tile-${monitor.id}`}
      className="absolute inset-0 w-full h-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
