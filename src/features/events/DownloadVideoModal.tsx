import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { exportEvents } from '@/api/eventVideos';
import { getEventVideoUrl } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import { capExportIds, EXPORT_MAX_EVENTS, saveBlob, mediaSize, type MediaDialogVariant } from './eventMedia';
import { MediaButton, MediaStatus } from './mediaDialogParts';

export interface DownloadVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  ids: readonly number[];
  /** The rows behind `ids`, for the size estimate. */
  events?: readonly ZmEvent[];
  /** How many events there were before the 500 cut, when the caller cut them. */
  totalMatches?: number;
  variant?: MediaDialogVariant;
}

type Format = 'mp4' | 'zip';

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; blob: Blob | null; filename: string; href?: string }
  | { kind: 'error'; message: string };

/**
 * Legacy's Download Video dialog (`ajax/modals/download.php`, driven by
 * `skins/classic/js/export.js`): what is being downloaded and roughly how
 * big, the archive format, Generate Download, then a link to the result.
 * Opened from the events list on the ticked rows and from Montage Review on
 * the events in the window.
 *
 * Zip is the event videos packed by zm-api (`/events/export` with only the
 * video part). Legacy's "mp4" merges every event into one file, which
 * zm-api does not do; here it is offered for a single event, where it is
 * that event's own recording. Tar is not served.
 */
export function DownloadVideoModal({ isOpen, ...rest }: DownloadVideoModalProps) {
  if (!isOpen) return null;
  return <DownloadForm {...rest} />;
}

function DownloadForm({ onClose, ids, events, totalMatches, variant = 'modern' }: Omit<DownloadVideoModalProps, 'isOpen'>) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.accessToken);
  const cap = capExportIds(ids);
  const matched = Math.max(totalMatches ?? 0, cap.total);
  const single = cap.ids.length === 1;
  // Legacy ticks both mp4 and zip; the later one wins, so zip is the default.
  const [format, setFormat] = useState<Format>('zip');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const known = events?.filter((e) => cap.ids.includes(e.id)) ?? [];
  const approx = mediaSize(variant, known.reduce((sum, e) => sum + (e.disk_space ?? 0), 0));

  const run = async () => {
    if (format === 'mp4' && single) {
      const href = getEventVideoUrl(cap.ids[0], token ?? undefined);
      const a = document.createElement('a');
      a.href = href;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus({ kind: 'done', blob: null, filename: known[0]?.default_video || `${cap.ids[0]}.mp4`, href });
      return;
    }
    setStatus({ kind: 'running' });
    try {
      const { blob, filename } = await exportEvents({ ids: cap.ids, include: ['video'] });
      const name = filename || 'zmDownload.zip';
      saveBlob(blob, name);
      setStatus({ kind: 'done', blob, filename: name });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Download')}>
      <div className="space-y-3 text-sm text-fg" data-testid="download-modal">
        <div>
          {cap.ids.length === 0 ? (
            <p className="text-warn">{t('There are no events found. Resulting download will be empty.')}</p>
          ) : single ? (
            <p>{t('Downloading event {{id}}. Resulting file should be approximately {{size}}', { id: cap.ids[0], size: approx })}</p>
          ) : (
            <p>{t('Downloading {{count}} events. Resulting file should be approximately {{size}}', { count: cap.ids.length, size: approx })}</p>
          )}
          {matched > cap.ids.length && (
            <p role="note" className="text-warn" data-testid="download-cap-notice">
              {t('Warning: Too many recordings specified. Only the first {{max}} of {{total}} will be downloaded.', {
                max: EXPORT_MAX_EVENTS, total: matched,
              })}
            </p>
          )}
        </div>

        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="font-medium me-2 float-start">{t('Export File Format')}</legend>
          <label
            className={single ? 'flex items-center gap-1' : 'flex items-center gap-1 text-fg-dim'}
            title={single ? undefined : t('Merging several events into one mp4 is not available')}
          >
            <input type="radio" name="downloadFormat" value="mp4" checked={format === 'mp4'} disabled={!single} onChange={() => setFormat('mp4')} />
            {t('mp4')}
          </label>
          <label className="flex items-center gap-1 text-fg-dim" title={t('zm-api builds zip archives only')}>
            <input type="radio" name="downloadFormat" value="tar" disabled />
            {t('Tar')}
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="downloadFormat" value="zip" checked={format === 'zip'} onChange={() => setFormat('zip')} />
            {t('Zip')}
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <MediaButton
            variant={variant}
            primary
            onClick={() => void run()}
            disabled={cap.ids.length === 0 || status.kind === 'running'}
          >
            {t('Generate Download')}
          </MediaButton>
          <MediaButton variant={variant} onClick={onClose} className="ms-auto">{t('Close')}</MediaButton>
        </div>

        {status.kind === 'running' && <MediaStatus tone="busy">{t('Exporting…')}</MediaStatus>}
        {status.kind === 'error' && <MediaStatus tone="error">{t('Export Failed')}: {status.message}</MediaStatus>}
        {status.kind === 'done' && (
          <div className="space-y-1">
            <MediaStatus tone="ok">{t('Export Succeeded')}</MediaStatus>
            {status.href ? (
              <a href={status.href} download className="text-accent underline">
                {t('Download "{{file}}"', { file: status.filename })}
              </a>
            ) : status.blob && (
              <button type="button" onClick={() => saveBlob(status.blob as Blob, status.filename)} className="text-accent underline">
                {t('Download "{{file}}"', { file: status.filename })}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
