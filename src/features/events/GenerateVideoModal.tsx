import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import {
  deleteEventVideo, generateEventVideo, getEventVideoFileUrl, listEventVideos, type EventVideo,
} from '@/api/eventVideos';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useZmConfig } from '@/features/config/useZmConfig';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import {
  parseFfmpegFormats, VIDEO_MAX_WIDTHS, VIDEO_RATES, videoRateText, videoScaleText, videoSizeRequest,
  waitForGeneratedVideo, mediaSize, type MediaDialogVariant,
} from './eventMedia';
import { MediaButton, MediaStatus } from './mediaDialogParts';

export interface GenerateVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: ZmEvent;
  variant?: MediaDialogVariant;
  /** Poll timing, for tests. */
  pollIntervalMs?: number;
  pollTries?: number;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; name: string }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string };

/**
 * Legacy's Video view (`views/video.php` + `views/js/video.js`), opened from
 * the event page's Generate Video button: the format / frame rate / size /
 * transform / overwrite form, Generate, and the event's video files with
 * Download and Delete. Clicking a file name plays it above the form, as
 * `&showIndex=` does.
 *
 * zm-api queues the job and returns at once (zm-api#187); the job list
 * cannot be read on the current build (zm-api#191), so the dialog polls the
 * file list until the new file shows up, and stops after two minutes with a
 * message instead of spinning forever.
 */
export function GenerateVideoModal({ isOpen, ...rest }: GenerateVideoModalProps) {
  if (!isOpen) return null;
  return <GenerateForm {...rest} />;
}

function GenerateForm({
  onClose, event, variant = 'modern', pollIntervalMs = 3000, pollTries = 40,
}: Omit<GenerateVideoModalProps, 'isOpen'>) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const ffmpegOn = useZmConfig('ZM_OPT_FFMPEG', true);
  const formatsRaw = useZmConfig('ZM_FFMPEG_FORMATS', 'mp4* mpg mpeg wmv asf avi mov swf 3gp**');
  const { formats, defaultFormat } = parseFfmpegFormats(formatsRaw);

  const [format, setFormat] = useState('');
  const [rate, setRate] = useState(1);
  const [sizeChoice, setSizeChoice] = useState('actual');
  const [transform, setTransform] = useState<'none' | 'greyscale'>('none');
  const [overwrite, setOverwrite] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [showing, setShowing] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const effectiveFormat = format || defaultFormat;

  // Closing the dialog stops the poll.
  const closed = useRef(false);
  useEffect(() => () => { closed.current = true; }, []);

  const filesQ = useQuery({
    queryKey: ['eventVideos', event.id],
    queryFn: () => listEventVideos(event.id),
  });
  const files = filesQ.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['eventVideos', event.id] });

  const generate = async () => {
    setStatus({ kind: 'running' });
    try {
      const before = files;
      await generateEventVideo(event.id, {
        format: effectiveFormat || null,
        rate,
        ...videoSizeRequest(sizeChoice, event.width, event.height),
        transform,
        overwrite,
      });
      const made = await waitForGeneratedVideo(event.id, before, {
        intervalMs: pollIntervalMs, tries: pollTries, isCancelled: () => closed.current,
      });
      if (closed.current) return;
      await refresh();
      setStatus(made ? { kind: 'done', name: made.name } : { kind: 'timeout' });
    } catch (err) {
      if (!closed.current) setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const remove = async (v: EventVideo) => {
    setDeleteError(null);
    try {
      await deleteEventVideo(event.id, v.name);
      if (showing === v.name) setShowing(null);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  };

  const fileUrl = (name: string) => getEventVideoFileUrl(event.id, name, token);
  const th = 'text-end font-semibold pe-3 py-1 whitespace-nowrap';
  const select = 'px-2 py-1 text-sm border border-border rounded-sm bg-surface text-fg';

  return (
    <Modal isOpen onClose={onClose} title={t('Video')}>
      <div className="space-y-3 text-sm text-fg" data-testid="video-modal">
        {showing && (
          <div className="space-y-1">
            <h3 className="font-semibold">{showing}</h3>
            <video dir="ltr" controls src={fileUrl(showing)} className="w-full bg-black" />
          </div>
        )}

        <table>
          <tbody>
            <tr>
              <th scope="row" className={th}><label htmlFor="video-format">{t('Video Format')}</label></th>
              <td>
                <select id="video-format" value={effectiveFormat} onChange={(e) => setFormat(e.target.value)} className={select}>
                  {formats.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </td>
            </tr>
            <tr>
              <th scope="row" className={th}><label htmlFor="video-rate">{t('Frame Rate')}</label></th>
              <td>
                <select id="video-rate" value={String(rate)} onChange={(e) => setRate(Number(e.target.value))} className={select}>
                  {VIDEO_RATES.map((r) => <option key={r.value} value={String(r.value)}>{r.label}</option>)}
                </select>
              </td>
            </tr>
            <tr>
              <th scope="row" className={th}><label htmlFor="video-size">{t('Video Size')}</label></th>
              <td>
                <select id="video-size" value={sizeChoice} onChange={(e) => setSizeChoice(e.target.value)} className={select}>
                  <option value="actual">{t('Actual')}</option>
                  {VIDEO_MAX_WIDTHS.map((w) => (
                    <option key={w} value={`max${w}`}>{t('Max {{width}}px', { width: w })}</option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <th scope="row" className={th}><label htmlFor="video-transform">{t('Transform')}</label></th>
              <td>
                <select id="video-transform" value={transform} onChange={(e) => setTransform(e.target.value as 'none' | 'greyscale')} className={select}>
                  <option value="none">{t('None')}</option>
                  <option value="greyscale">{t('Grayscale')}</option>
                </select>
              </td>
            </tr>
            <tr>
              <th scope="row" className={th}><label htmlFor="video-overwrite">{t('Overwrite Existing')}</label></th>
              <td><input id="video-overwrite" type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /></td>
            </tr>
          </tbody>
        </table>

        <div className="flex flex-wrap items-center gap-2">
          <MediaButton
            variant={variant}
            primary
            onClick={() => void generate()}
            disabled={!ffmpegOn || status.kind === 'running'}
            title={ffmpegOn ? t('Generate Video') : t('ZM_OPT_FFMPEG is off')}
          >
            {t('Generate Video')}
          </MediaButton>
          <MediaButton variant={variant} onClick={onClose} className="ms-auto">{t('Close')}</MediaButton>
        </div>

        {status.kind === 'running' && <MediaStatus tone="busy">{t('Generating Video')}</MediaStatus>}
        {status.kind === 'done' && <MediaStatus tone="ok">{t('Export Succeeded')} ({status.name})</MediaStatus>}
        {status.kind === 'timeout' && (
          <MediaStatus tone="error">
            {t('No new video file has appeared yet. It may still be generating, or the job failed; check the list again later.')}
          </MediaStatus>
        )}
        {status.kind === 'error' && <MediaStatus tone="error">{t('Export Failed')}: {status.message}</MediaStatus>}

        <h3 className="font-semibold">{t('Existing Video Files')}</h3>
        {deleteError && <MediaStatus tone="error">{t('Delete failed: {{message}}', { message: deleteError })}</MediaStatus>}
        <table className="w-full text-xs border border-border-subtle" data-testid="video-files">
          <thead className="bg-surface-2 text-fg-muted">
            <tr>
              <th className="px-2 py-1 text-start">{t('Filename')}</th>
              <th className="px-2 py-1 text-end">{t('Size')}</th>
              <th className="px-2 py-1 text-start">{t('Rate')}</th>
              <th className="px-2 py-1 text-start">{t('Scale')}</th>
              <th className="px-2 py-1 text-start">{t('Action')}</th>
            </tr>
          </thead>
          <tbody>
            {filesQ.isError ? (
              <tr><td colSpan={5} className="px-2 py-1 text-danger">{t('Could not list the video files.')}</td></tr>
            ) : files.length === 0 ? (
              <tr><td colSpan={5} className="px-2 py-1">{filesQ.isLoading ? t('Loading…') : t('No Video Files Found')}</td></tr>
            ) : files.map((v) => (
              <tr key={v.name} className="border-t border-border-subtle">
                <td className="px-2 py-0.5">
                  <button type="button" onClick={() => setShowing(v.name)} className="text-accent underline text-start break-all">
                    {v.name}
                  </button>
                </td>
                <td className="px-2 py-0.5 text-end tabular-nums whitespace-nowrap">{mediaSize(variant, v.size_bytes)}</td>
                <td className="px-2 py-0.5">{videoRateText(v)}</td>
                <td className="px-2 py-0.5">{videoScaleText(v, t('Actual'))}</td>
                <td className="px-2 py-0.5 whitespace-nowrap">
                  <a href={fileUrl(v.name)} download={v.name} className="text-accent underline">{t('Download')}</a>
                  {/* The recording itself is not this dialog's to delete. */}
                  {!v.recorded && (
                    <RequirePerm feature="events" level="Edit">
                      {' / '}
                      <button type="button" onClick={() => void remove(v)} className="text-accent underline">{t('Delete')}</button>
                    </RequirePerm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
