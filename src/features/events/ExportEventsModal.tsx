import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { exportEvents, type ExportPart } from '@/api/eventVideos';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import type { ZmEvent } from '@/types';
import { formatDurationHms } from './duration';
import { capExportIds, EXPORT_MAX_EVENTS, EXPORT_PART_KEYS, saveBlob, mediaSize, type MediaDialogVariant } from './eventMedia';
import { MediaButton, MediaStatus } from './mediaDialogParts';

export interface ExportEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The events to export, in order. Anything past 500 is dropped with a notice. */
  ids: readonly number[];
  /** Rows for the list at the top, when the caller has them. */
  events?: readonly ZmEvent[];
  monitorName?: (id: number) => string;
  /**
   * How many events matched when `ids` is already a cut-down set (Export
   * Matches fetches at most 500), so the notice can say so.
   */
  totalMatches?: number;
  variant?: MediaDialogVariant;
}

/**
 * Legacy's Export view (`views/export.php` + `views/js/export.js`) as a
 * dialog: "Export the following N events", the five part checkboxes, the
 * archive format, Export, then the progress line and a Download button.
 * zm-api builds the zip in one request (zm-api#30); tar and compression are
 * not served, so Tar shows disabled and Use Compression is left out.
 */
export function ExportEventsModal({ isOpen, ...rest }: ExportEventsModalProps) {
  if (!isOpen) return null;
  return <ExportForm {...rest} />;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; blob: Blob; filename: string }
  | { kind: 'error'; message: string };

function ExportForm({
  onClose, ids, events, monitorName, totalMatches, variant = 'modern',
}: Omit<ExportEventsModalProps, 'isOpen'>) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  // Legacy starts with every part ticked (export.php, no session values).
  const [parts, setParts] = useState<Record<ExportPart, boolean>>({
    details: true, frames: true, images: true, video: true, misc: true,
  });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const cap = capExportIds(ids);
  const matched = Math.max(totalMatches ?? 0, cap.total);
  const include = EXPORT_PART_KEYS.filter((p) => parts[p]);
  const canExport = cap.ids.length > 0 && include.length > 0 && status.kind !== 'running';

  const labels: Record<ExportPart, string> = {
    details: t('Export Event Details'),
    frames: t('Export Frame Details'),
    images: t('Export Image Files'),
    video: t('Export Video Files (if present)'),
    misc: t('Export Other Files (if present)'),
  };

  const run = async () => {
    setStatus({ kind: 'running' });
    try {
      const { blob, filename } = await exportEvents({ ids: cap.ids, include });
      const name = filename || 'zmExport.zip';
      saveBlob(blob, name);
      setStatus({ kind: 'done', blob, filename: name });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const rows = events ? events.filter((e) => cap.ids.includes(e.id)) : [];
  const diskTotal = rows.reduce((sum, e) => sum + (e.disk_space ?? 0), 0);

  return (
    <Modal isOpen onClose={onClose} title={t('Export Options')}>
      <div className="space-y-3 text-sm text-fg" data-testid="export-modal">
        <p>{t('Export the following {{count}} events:', { count: cap.ids.length })}</p>
        {matched > cap.ids.length && (
          <p role="note" className="text-warn" data-testid="export-cap-notice">
            {t('{{total}} events match; only the first {{max}} can be exported at once. Narrow the selection to export the rest.', {
              total: matched, max: EXPORT_MAX_EVENTS,
            })}
          </p>
        )}

        {rows.length > 0 && (
          <div className="max-h-48 overflow-auto border border-border-subtle">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-fg-muted">
                <tr>
                  <th className="px-2 py-1 text-start">{t('Id')}</th>
                  <th className="px-2 py-1 text-start">{t('Name')}</th>
                  <th className="px-2 py-1 text-start">{t('Monitor')}</th>
                  <th className="px-2 py-1 text-start">{t('Time')}</th>
                  <th className="px-2 py-1 text-end">{t('Duration')}</th>
                  <th className="px-2 py-1 text-end">{t('Disk Space')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-border-subtle">
                    <td className="px-2 py-0.5 tabular-nums">{e.id}{e.archived === 1 ? '*' : ''}</td>
                    <td className="px-2 py-0.5">{e.name}</td>
                    <td className="px-2 py-0.5">{monitorName ? monitorName(e.monitor_id) : e.monitor_id}</td>
                    <td className="px-2 py-0.5 whitespace-nowrap">{e.start_date_time ? formatDateTime(e.start_date_time) : ''}</td>
                    <td className="px-2 py-0.5 text-end tabular-nums">{formatDurationHms(e.length)}</td>
                    <td className="px-2 py-0.5 text-end tabular-nums">{mediaSize(variant, e.disk_space)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-subtle font-semibold">
                  <td colSpan={5} className="px-2 py-0.5">{t('{{count}} events', { count: rows.length })}</td>
                  <td className="px-2 py-0.5 text-end tabular-nums">{mediaSize(variant, diskTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <legend className="sr-only">{t('Export Options')}</legend>
          {EXPORT_PART_KEYS.map((p) => (
            <label key={p} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={parts[p]}
                onChange={(e) => setParts((prev) => ({ ...prev, [p]: e.target.checked }))}
                disabled={status.kind === 'running'}
              />
              {labels[p]}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="font-medium me-2 float-start">{t('Export File Format')}</legend>
          <label className="flex items-center gap-1 text-fg-dim" title={t('zm-api builds zip archives only')}>
            <input type="radio" name="exportFormat" value="tar" disabled />
            {t('Tar')}
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="exportFormat" value="zip" checked readOnly />
            {t('Zip')}
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <MediaButton variant={variant} primary onClick={() => void run()} disabled={!canExport}>
            {t('Export')}
          </MediaButton>
          {status.kind === 'done' && (
            <MediaButton variant={variant} onClick={() => saveBlob(status.blob, status.filename)}>
              {t('Download')}
            </MediaButton>
          )}
          <MediaButton variant={variant} onClick={onClose} className="ms-auto">
            {t('Close')}
          </MediaButton>
        </div>

        {status.kind === 'running' && <MediaStatus tone="busy">{t('Exporting…')}</MediaStatus>}
        {status.kind === 'done' && (
          <MediaStatus tone="ok">{t('Export Succeeded')} ({status.filename})</MediaStatus>
        )}
        {status.kind === 'error' && (
          <MediaStatus tone="error">{t('Export Failed')}: {status.message}</MediaStatus>
        )}
      </div>
    </Modal>
  );
}
