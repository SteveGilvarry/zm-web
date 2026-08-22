import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useBackendStatus } from './backendStatus';
import { Button } from './Button';

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
      className="flex items-center gap-3 px-4 py-2 text-sm bg-danger/15 border-b border-danger/40 text-fg"
    >
      <WifiOff size={16} aria-hidden className="text-danger shrink-0" />
      <span className="flex-1 min-w-0">
        {t('Cannot reach the server. Data shown may be stale.')}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void queryClient.refetchQueries({ type: 'active' })}
        className="border border-danger/40 text-fg hover:bg-danger/20"
      >
        <RefreshCw size={13} aria-hidden />
        {t('Retry')}
      </Button>
    </div>
  );
}
