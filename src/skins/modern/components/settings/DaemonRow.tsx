import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle, Play, RotateCcw, Square, XCircle } from 'lucide-react';
import type { DaemonAction } from '@/features/settings/useSettingsOptionsPage';
import type { DaemonStatus } from '@/types';

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
    daemon.state === 'running' ? 'text-emerald' : daemon.state === 'stopped' ? 'text-crimson' : 'text-amber';

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-panel/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon size={14} className={statusColor} />
        <span className="text-sm font-mono text-text-secondary truncate">{daemon.name}</span>
      </div>
      <div className="flex items-center gap-1">
        {daemon.state !== 'running' && (
          <button
            onClick={() => onAction('start')}
            disabled={isLoading}
            className="p-1.5 rounded text-emerald hover:bg-emerald/20 transition-colors"
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
            className="p-1.5 rounded text-crimson hover:bg-crimson/20 transition-colors"
            title={t('Stop')}
            aria-label={t('Stop')}
          >
            <Square size={12} />
          </button>
        )}
        <button
          onClick={() => onAction('restart')}
          disabled={isLoading}
          className="p-1.5 rounded text-amber hover:bg-amber/20 transition-colors"
          title={t('Restart')}
          aria-label={t('Restart')}
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
}
