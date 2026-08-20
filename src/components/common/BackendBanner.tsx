import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useBackendStatus } from './backendStatus';

/**
 * Global "backend unreachable" strip. Shown while the last API call failed
 * at the network or 5xx level; clears itself on the next successful
 * request. Mount once per shell, above the page content.
 */
export function BackendBanner() {
  const { t } = useTranslation();
  const unreachable = useBackendStatus((s) => s.unreachable);
  const queryClient = useQueryClient();
  if (!unreachable) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 text-sm bg-crimson/15 border-b border-crimson/40 text-text-primary"
    >
      <WifiOff size={16} aria-hidden className="text-crimson shrink-0" />
      <span className="flex-1 min-w-0">
        {t('Cannot reach the server. Data shown may be stale.')}
      </span>
      <button
        type="button"
        onClick={() => void queryClient.refetchQueries({ type: 'active' })}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-crimson/40 hover:bg-crimson/20 transition-colors"
      >
        <RefreshCw size={13} aria-hidden />
        {t('Retry')}
      </button>
    </div>
  );
}
