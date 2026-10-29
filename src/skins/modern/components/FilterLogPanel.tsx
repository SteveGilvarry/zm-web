import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LOG_LEVEL } from '@/api/logs';
import { usePerms } from '@/features/auth/usePerms';
import { LogMessage } from '@/features/logs/LogMessage';
import { useLogTimeFormat } from '@/features/logs/useLogsPage';
import { filterLogComponent, useFilterLog } from '@/features/filters/useFilterLog';

/** State colour as a small mark on the level, never a row fill (docs/DESIGN.md). */
function levelTone(level: number): string {
  if (level <= LOG_LEVEL.ERROR) return 'text-danger';
  if (level === LOG_LEVEL.WARNING) return 'text-warn';
  return 'text-fg-dim';
}

const iconBtn = 'p-1 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-40';

/**
 * What the selected filter has been doing: its `zmfilter_<Id>` log rows,
 * newest first, ten a page — legacy 1.39.41's filter log panel. Shown to
 * System viewers; System editors can clear it.
 */
export function ModernFilterLogPanel({ filterId }: { filterId: number }) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const canView = can('system', 'View');
  const canEdit = can('system', 'Edit');
  const s = useFilterLog(filterId, { enabled: canView });
  const formatLogTime = useLogTimeFormat();
  const [confirmClear, setConfirmClear] = useState(false);

  if (!canView) return null;

  return (
    <section aria-label={t('Filter log')} data-testid="filter-log" className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-fg">{t('Filter log')}</h3>
        <span className="text-xs text-fg-dim tabular-nums">
          {t('{{count}} entry', { count: s.total })}
        </span>
        <span className="ms-auto flex items-center gap-1">
          <button type="button" onClick={s.refetch} className={iconBtn} aria-label={t('Refresh filter log')}>
            <RefreshCw size={13} className={clsx(s.isFetching && 'animate-spin')} />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={s.total === 0 || s.clearPending}
              className={iconBtn}
              aria-label={t('Clear Logs')}
              title={t('Clear Logs')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </span>
      </div>
      {s.error && <p role="alert" className="text-xs text-danger">{s.error.message}</p>}
      <div className="border border-border-subtle rounded bg-surface overflow-x-auto">
        {s.logs.length === 0 ? (
          <p className="p-4 text-center text-xs text-fg-dim">
            {s.isLoading ? t('Loading…') : t('This filter has not logged anything yet.')}
          </p>
        ) : (
          <table className="w-full text-xs" data-testid="filter-log-table">
            <thead className="border-b border-border-subtle text-fg-dim">
              <tr>
                <th scope="col" className="px-2 py-1 text-start font-medium">{t('Time')}</th>
                <th scope="col" className="px-2 py-1 text-start font-medium">{t('Level')}</th>
                <th scope="col" className="px-2 py-1 text-start font-medium">{t('Message')}</th>
                <th scope="col" className="px-2 py-1 text-start font-medium">{t('Source')}</th>
              </tr>
            </thead>
            <tbody>
              {s.logs.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-2 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">{formatLogTime(row.time_key)}</td>
                  <td className={clsx('px-2 py-1 font-mono', levelTone(row.level))}>{row.code}</td>
                  <td className="px-2 py-1 text-fg"><LogMessage message={row.message} /></td>
                  <td className="px-2 py-1 font-mono text-fg-dim whitespace-nowrap">
                    {[row.file, row.line].filter((v) => v != null && v !== '').join(':')}
                    {row.pid != null ? ` (${row.pid})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {s.lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-fg-dim">
          <button type="button" onClick={() => s.setPage(s.page - 1)} disabled={s.page <= 1} className={iconBtn} aria-label={t('Previous page')}>
            <ChevronLeft size={12} className="rtl:-scale-x-100" />
          </button>
          <span className="font-mono tabular-nums">{t('Page {{page}} of {{last}}', { page: s.page, last: s.lastPage })}</span>
          <button type="button" onClick={() => s.setPage(s.page + 1)} disabled={s.page >= s.lastPage} className={iconBtn} aria-label={t('Next page')}>
            <ChevronRight size={12} className="rtl:-scale-x-100" />
          </button>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); s.clear(); }}
        title={t('Clear Logs')}
        message={t('Delete every {{component}} log row?', { component: filterLogComponent(filterId) })}
        confirmText={t('Clear Logs')}
        variant="danger"
      />
    </section>
  );
}
