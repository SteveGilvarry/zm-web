import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AlertCircle, Inbox, Loader2, Lock, RefreshCw, WifiOff } from 'lucide-react';
import { apiErrorMessage, classifyApiError } from '@/api/client';

interface QueryStateProps {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  /** Wire to `refetch`. Hidden for 403s (retrying will not help). */
  onRetry?: () => void;
  /** True when the query succeeded with nothing to show. */
  empty?: boolean;
  emptyMessage?: ReactNode;
  /** Optional action rendered under the empty message (e.g. "Add monitor"). */
  emptyAction?: ReactNode;
  loadingMessage?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * One component for the four states every list/detail page has. Makes
 * "backend down" and "not permitted" look different from "no rows".
 *
 *   <QueryState isLoading={isLoading} isError={isError} error={error}
 *               onRetry={refetch} empty={rows.length === 0}
 *               emptyMessage={t('No events found')}>
 *     <Table rows={rows} />
 *   </QueryState>
 */
export function QueryState({
  isLoading,
  isError = false,
  error,
  onRetry,
  empty = false,
  emptyMessage,
  emptyAction,
  loadingMessage,
  className,
  children,
}: QueryStateProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Frame className={className} role="status">
        <Loader2 size={20} className="animate-spin text-cyan" aria-hidden />
        <p className="text-sm text-text-muted">{loadingMessage ?? t('Loading…')}</p>
      </Frame>
    );
  }

  if (isError) {
    const kind = classifyApiError(error);
    if (kind === 'forbidden') {
      return (
        <Frame className={className} role="status" data-state="forbidden">
          <Lock size={20} className="text-amber" aria-hidden />
          <p className="text-sm text-text-primary">{t('You do not have permission to view this.')}</p>
        </Frame>
      );
    }
    const unreachable = kind === 'network' || kind === 'server';
    return (
      <Frame className={className} role="alert" data-state={unreachable ? 'unreachable' : 'error'}>
        {unreachable ? (
          <WifiOff size={20} className="text-crimson" aria-hidden />
        ) : (
          <AlertCircle size={20} className="text-crimson" aria-hidden />
        )}
        <p className="text-sm text-text-primary">
          {unreachable ? t('Cannot reach the server.') : t('Failed to load.')}
        </p>
        {!unreachable && error != null && (
          <p className="text-xs text-text-muted font-mono break-all">{apiErrorMessage(error)}</p>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border-subtle bg-panel text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={13} aria-hidden />
            {t('Retry')}
          </button>
        )}
      </Frame>
    );
  }

  if (empty) {
    return (
      <Frame className={className} role="status" data-state="empty">
        <Inbox size={20} className="text-text-muted" aria-hidden />
        <p className="text-sm text-text-muted">{emptyMessage ?? t('Nothing to show.')}</p>
        {emptyAction}
      </Frame>
    );
  }

  return <>{children}</>;
}

function Frame({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
  role: 'status' | 'alert';
  'data-state'?: string;
}) {
  return (
    <div
      {...rest}
      className={clsx('flex flex-col items-center justify-center gap-2 py-12 px-4 text-center', className)}
    >
      {children}
    </div>
  );
}
