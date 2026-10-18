import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LOG_LEVEL } from '@/api/logs';
import { usePerms } from '@/features/auth/usePerms';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { LogMessage } from '@/features/logs/LogMessage';
import { useLogTimeFormat } from '@/features/logs/useLogsPage';
import { filterLogComponent, useFilterLog } from '@/features/filters/useFilterLog';
import {
  ClassicButton, ClassicTable, ClassicTbody, ClassicTd, ClassicTh, ClassicThead,
} from './events/primitives';

/** Legacy log row bands: errors and worse red, warnings amber. */
function levelBand(level: number): string | undefined {
  if (level <= LOG_LEVEL.ERROR) return 'bg-[#f8d7da]';
  if (level === LOG_LEVEL.WARNING) return 'bg-[#fff3cd]';
  return undefined;
}

/**
 * Legacy 1.39.41's "Filter log" fieldset under the filter form
 * (filter.php:394-412): the shared log panel locked to this filter's
 * `zmfilter_<Id>` component, ten rows a page, no Back / Refresh page
 * buttons, for System viewers only. The component column is dropped
 * because every row has the same one.
 */
export function ClassicFilterLogPanel({ filterId }: { filterId: number }) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const canView = can('system', 'View');
  const canEdit = can('system', 'Edit');
  const s = useFilterLog(filterId, { enabled: canView });
  const formatLogTime = useLogTimeFormat();
  const { formatDateTime } = useDateTimeFormat();
  const [confirmClear, setConfirmClear] = useState(false);
  const [updated, setUpdated] = useState(() => ({ fetching: s.isFetching, at: new Date() }));
  if (updated.fetching !== s.isFetching) {
    setUpdated({ fetching: s.isFetching, at: s.isFetching ? updated.at : new Date() });
  }

  if (!canView) return null;

  const first = s.logs.length === 0 ? 0 : (s.page - 1) * 10 + 1;
  const last = s.logs.length === 0 ? 0 : first + s.logs.length - 1;

  return (
    <fieldset id="FilterLog" className="mx-4 my-3 border border-[#dee2e6] px-3 pb-3" data-testid="filter-log">
      <legend className="px-1 text-base">{t('Filter log')}</legend>
      <p className="text-center text-sm text-zinc-800">
        {t('Total: {{total}} - Displaying: {{first}} to {{last}} - Updated: {{time}}', {
          total: s.total, first, last, time: formatDateTime(updated.at),
        })}
      </p>
      <div className="flex items-center gap-1.5 my-2">
        <ClassicButton tone="primary" onClick={s.refetch} aria-label={t('Refresh filter log')} title={t('Refresh')}>
          <RefreshCw size={14} className={clsx(s.isFetching && 'animate-spin')} aria-hidden />
        </ClassicButton>
        {canEdit && (
          <ClassicButton
            tone="danger"
            onClick={() => setConfirmClear(true)}
            disabled={s.total === 0 || s.clearPending}
            title={t('Clear Logs')}
          >
            <Trash2 size={14} aria-hidden /> {t('Clear Logs')}
          </ClassicButton>
        )}
      </div>
      {s.error && <p role="alert" className="text-xs text-[#a94442] mb-2">{s.error.message}</p>}
      <ClassicTable testId="filter-log-table">
        <ClassicThead>
          <tr>
            <ClassicTh>{t('Date Time')}</ClassicTh>
            <ClassicTh numeric>{t('Pid')}</ClassicTh>
            <ClassicTh>{t('Level')}</ClassicTh>
            <ClassicTh>{t('Message')}</ClassicTh>
            <ClassicTh>{t('File')}</ClassicTh>
            <ClassicTh numeric>{t('Line')}</ClassicTh>
          </tr>
        </ClassicThead>
        <ClassicTbody>
          {s.logs.length === 0 && (
            <tr>
              <ClassicTd colSpan={6} center className="py-4 text-zinc-500">
                {s.isLoading ? t('Loading…') : t('No matching records found')}
              </ClassicTd>
            </tr>
          )}
          {s.logs.map((row) => (
            <tr key={row.id} className={levelBand(row.level)}>
              <ClassicTd className="whitespace-nowrap">{formatLogTime(row.time_key)}</ClassicTd>
              <ClassicTd numeric>{row.pid ?? ''}</ClassicTd>
              <ClassicTd>{row.code}</ClassicTd>
              <ClassicTd><LogMessage message={row.message} /></ClassicTd>
              <ClassicTd>{row.file ?? ''}</ClassicTd>
              <ClassicTd numeric>{row.line ?? ''}</ClassicTd>
            </tr>
          ))}
        </ClassicTbody>
      </ClassicTable>
      {s.lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 mt-2 text-sm">
          <ClassicButton onClick={() => s.setPage(s.page - 1)} disabled={s.page <= 1} aria-label={t('Previous page')}>‹</ClassicButton>
          <span>{t('Page {{page}} of {{last}}', { page: s.page, last: s.lastPage })}</span>
          <ClassicButton onClick={() => s.setPage(s.page + 1)} disabled={s.page >= s.lastPage} aria-label={t('Next page')}>›</ClassicButton>
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
    </fieldset>
  );
}
