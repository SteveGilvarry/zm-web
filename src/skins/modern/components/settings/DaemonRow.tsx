import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle, Play, RotateCcw, Square, XCircle } from 'lucide-react';
import type { DaemonAction } from '@/features/settings/useSettingsOptionsPage';
import type { DaemonStatus } from '@/types';

const verb = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * One daemon: whether it is up, and the verbs that make sense for that.
 *
 * Up / down / unknown is the only colour on the row — Stop keeps danger
 * because stopping a capture daemon is a warning, not decoration.
 */
export function DaemonRow({
  daemon,
  onAction,
  isLoading,
}: {
  daemon: DaemonStatus;
  onAction: (action: DaemonAction) => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const StatusIcon =
    daemon.state === 'running' ? CheckCircle : daemon.state === 'stopped' ? XCircle : AlertCircle;
  const statusColor =
    daemon.state === 'running' ? 'text-ok' : daemon.state === 'stopped' ? 'text-danger' : 'text-warn';

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon size={14} className={clsx('shrink-0', statusColor)} aria-hidden />
        <span className="text-sm font-mono text-fg truncate">{daemon.name}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {daemon.state !== 'running' && (
          <button
            onClick={() => onAction('start')}
            disabled={isLoading}
            className={verb}
            title={t('Start')}
            aria-label={t('Start')}
          >
            <Play size={12} />
          </button>
        )}
        {daemon.state === 'running' && (
          <button
            onClick={() => onAction('stop')}
            disabled={isLoading}
            className="p-1.5 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('Stop')}
            aria-label={t('Stop')}
          >
            <Square size={12} />
          </button>
        )}
        <button
          onClick={() => onAction('restart')}
          disabled={isLoading}
          className={verb}
          title={t('Restart')}
          aria-label={t('Restart')}
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
}
