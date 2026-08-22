import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Download, Eye, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import { updateEvent, deleteEvent, getEventVideoUrl } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useToast } from '@/components/common/toastStore';
import { EventEditForm, type EventEditValues } from './EventEditForm';
import { bulkEditPayload } from './bulkEdit';
import { useBulkFanOut } from './bulkFanOut';

interface BulkActionBarProps {
  selectedIds: Set<number>;
  onClear: () => void;
  /**
   * `modern` floats a neutral bar at the bottom once rows are selected;
   * `classic` renders an inline flat-Bootstrap button row that is always
   * visible (legacy's toolbar icons, disabled until something is checked).
   */
  variant?: 'modern' | 'classic';
}

/**
 * Sticky action bar that appears at the bottom of the events list once one
 * or more rows are checked: View (open the first selected), Edit (name /
 * cause / notes / archived across the selection), Archive, Unarchive and
 * Delete. The backend has no bulk endpoint, so each action fans out one
 * request per id; the bar shows progress while it runs and lists any ids
 * that failed instead of pretending the whole batch went through.
 */
export function BulkActionBar({ selectedIds, onClear, variant = 'modern' }: BulkActionBarProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { progress, start, dismiss } = useBulkFanOut();
  const toast = useToast();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [editOpen, setEditOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['recentEvents'] });
  };

  const ids = Array.from(selectedIds);
  const classic = variant === 'classic';
  if (!classic && ids.length === 0 && !progress.action) return null;

  const runAction = async (label: string, run: (id: number) => Promise<unknown>) => {
    const failed = await start(label, ids, run);
    invalidate();
    // Full success: clear the selection and the progress so the bar goes
    // away (legacy clears the selection after an action). Failures keep the
    // bar with the report and the failed ids selected for a retry.
    if (failed.length === 0) {
      dismiss();
      onClear();
    } else {
      toast.error(t('{{action}}: {{count}} event failed', { action: label, count: failed.length }));
    }
  };

  // Legacy "Download Video": one MP4 per selected event. Browsers only allow
  // a few scripted downloads in a row, so they are spaced out slightly.
  const downloadAll = () => {
    ids.forEach((id, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = getEventVideoUrl(id, accessToken ?? undefined);
        a.download = `event-${id}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 400);
    });
  };

  const busy = progress.running;
  const finishedWithFailures = !busy && progress.action && progress.failed.length > 0;

  const onEdit = (values: EventEditValues) => {
    const payload = bulkEditPayload(values);
    setEditOpen(false);
    if (Object.keys(payload).length === 0) return;
    void runAction(t('Edit'), (id) => updateEvent(id, payload));
  };

  return (
    <div
      role="region"
      aria-label={t('Bulk event actions')}
      data-variant={variant}
      className={clsx(
        classic
          ? 'flex flex-col gap-1'
          : [
            'fixed bottom-6 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-30',
            'flex flex-col gap-1.5 px-2 py-1.5 rounded',
            'bg-surface border border-border shadow-[var(--elevation-2)]',
            'animate-in fade-in slide-in-from-bottom-2 duration-200',
          ],
      )}
    >
      <div className="flex items-center gap-1">
        <span className={clsx('px-2 text-xs tabular-nums', classic ? 'text-zinc-600' : 'font-mono text-fg-muted')}>
          {t('{{count}} selected', { count: ids.length })}
        </span>
        {!classic && <div className="w-px h-5 bg-border-subtle mx-1" />}

        <BulkBtn
          variant={variant}
          icon={<Eye size={12} />}
          label={t('View')}
          onClick={() => navigate({ to: '/events/$eventId', params: { eventId: String(ids[0]) } })}
          disabled={busy || ids.length === 0}
        />
        <BulkBtn
          variant={variant}
          icon={<Download size={12} />}
          label={t('Download')}
          onClick={downloadAll}
          disabled={busy || ids.length === 0}
        />
        <RequirePerm feature="events" level="Edit">
          <BulkBtn
          variant={variant}
            icon={<Pencil size={12} />}
            label={t('Edit')}
            onClick={() => setEditOpen(true)}
            disabled={busy || ids.length === 0}
          />
          <BulkBtn
          variant={variant}
            icon={<Archive size={12} />}
            label={t('Archive')}
            onClick={() => void runAction(t('Archive'), (id) => updateEvent(id, { archived: true }))}
            disabled={busy || ids.length === 0}
          />
          <BulkBtn
          variant={variant}
            icon={<ArchiveRestore size={12} />}
            label={t('Unarchive')}
            onClick={() => void runAction(t('Unarchive'), (id) => updateEvent(id, { archived: false }))}
            disabled={busy || ids.length === 0}
          />
          <BulkBtn
          variant={variant}
            icon={<Trash2 size={12} />}
            label={t('Delete')}
            tone="danger"
            onClick={() => {
              if (confirm(t("Delete {{count}} event? This can't be undone.", { count: ids.length }))) {
                void runAction(t('Delete'), (id) => deleteEvent(id));
              }
            }}
            disabled={busy || ids.length === 0}
          />
        </RequirePerm>

        {!classic && <div className="w-px h-5 bg-border-subtle mx-1" />}
        <button
          onClick={() => { dismiss(); onClear(); }}
          disabled={busy || (classic && ids.length === 0 && !progress.action)}
          aria-label={t('Clear selection')}
          className={clsx(
            'p-1.5 rounded transition-colors disabled:opacity-50',
            classic ? 'text-zinc-500 hover:text-zinc-800' : 'text-fg-dim hover:text-fg hover:bg-surface-2',
          )}
        >
          <X size={12} />
        </button>
      </div>

      {/* Progress while running; result line afterwards. */}
      {busy && (
        <div
          role="status"
          className="flex items-center gap-2 px-2 text-xs font-mono tabular-nums text-fg-muted"
          data-testid="bulk-progress"
        >
          <span>{t('{{action}}: {{done}} / {{total}}', { action: progress.action, done: progress.done, total: progress.total })}</span>
          <progress
            className="h-1 w-32 [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-accent"
            value={progress.done}
            max={progress.total}
          />
        </div>
      )}
      {finishedWithFailures && (
        <div
          role="alert"
          className="flex items-start gap-2 px-2 text-xs text-warn max-w-md"
          data-testid="bulk-failures"
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {t('{{action}}: {{ok}} of {{total}} succeeded. Failed: {{ids}}', {
              action: progress.action,
              ok: progress.total - progress.failed.length,
              total: progress.total,
              ids: progress.failed.map((f) => `#${f.id} (${f.message})`).join(', '),
            })}
          </span>
        </div>
      )}

      {editOpen && (
        <EventEditForm
          isOpen
          bulk
          title={t('Edit {{count}} event', { count: ids.length })}
          onClose={() => setEditOpen(false)}
          onSubmit={onEdit}
        />
      )}
    </div>
  );
}

function BulkBtn({
  icon, label, onClick, disabled, tone = 'neutral', variant = 'modern',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone?: 'neutral' | 'danger';
  variant?: 'modern' | 'classic';
}) {
  const cls = variant === 'classic'
    ? (tone === 'danger'
      ? 'rounded-sm bg-[#d9534f] border-[#d43f3a] text-white hover:bg-[#c9302c]'
      : 'rounded-sm bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]')
    : (tone === 'danger'
      ? 'rounded border-danger/40 text-danger hover:bg-danger/10'
      : 'rounded border-border-subtle text-fg-muted hover:text-fg hover:border-border');
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 border text-xs font-medium transition-colors',
        cls,
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
