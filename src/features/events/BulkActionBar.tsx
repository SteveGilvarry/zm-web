import { useState, type MouseEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Download, ExternalLink, Eye, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import { updateEvent, deleteEvent } from '@/api/events';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useToast } from '@/components/common/toastStore';
import type { ZmEvent } from '@/types';
import { EventEditForm, type EventEditValues } from './EventEditForm';
import { bulkEditPayload } from './bulkEdit';
import { useBulkFanOut } from './bulkFanOut';
import { DownloadVideoModal } from './DownloadVideoModal';
import { ExportEventsModal } from './ExportEventsModal';

interface BulkActionBarProps {
  selectedIds: Set<number>;
  /**
   * The rows on screen. Fixes the order View walks the selection in, and
   * tells Unarchive / Delete which selected rows are archived (legacy reads
   * both off the table too, so a selection carried over from another page
   * is treated as unarchived).
   */
  events?: ZmEvent[];
  onClear: () => void;
  /**
   * `modern` floats a neutral bar at the bottom once rows are selected;
   * `classic` renders an inline flat-Bootstrap button row that is always
   * visible (legacy's toolbar icons, disabled until something is checked).
   */
  variant?: 'modern' | 'classic';
  /** Monitor names for the Export dialog's list. */
  monitorName?: (id: number) => string;
}

/** Which confirmation is open. Archive needs none (legacy fires it straight away). */
type Pending = 'unarchive' | 'delete' | null;

/**
 * Sticky action bar that appears at the bottom of the events list once one
 * or more rows are checked: View (open the first selected, Prev/Next walk
 * the rest), Edit (name / cause / notes / archived across the selection),
 * Archive, Unarchive and Delete. The backend has no bulk endpoint, so each
 * action fans out one request per id, ten at a time; the bar shows progress
 * while it runs and lists any ids that failed instead of pretending the
 * whole batch went through. Unarchive and Delete confirm first — Shift+click
 * skips the dialog, as in legacy.
 */
export function BulkActionBar({ selectedIds, events = [], onClear, variant = 'modern', monitorName }: BulkActionBarProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { progress, start, dismiss } = useBulkFanOut();
  const toast = useToast();
  const setNavScope = useEventPlaybackStore((s) => s.setNavScope);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  // Legacy's Export (`?view=export&eids[]=`) and Download Video
  // (`modals/download.php`) on the ticked rows.
  const [mediaOpen, setMediaOpen] = useState<'export' | 'download' | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['recentEvents'] });
  };

  const ids = Array.from(selectedIds);
  const classic = variant === 'classic';
  if (!classic && ids.length === 0 && !progress.action) return null;

  // Selected rows in table order first, then anything checked on another page.
  const onPage = events.filter((e) => selectedIds.has(e.id));
  const orderedIds = [
    ...onPage.map((e) => e.id),
    ...ids.filter((id) => !onPage.some((e) => e.id === id)),
  ];
  const archivedSelected = new Set(onPage.filter((e) => e.archived === 1).map((e) => e.id));

  const runAction = async (label: string, run: (id: number) => Promise<unknown>, targets: number[] = ids) => {
    const failed = await start(label, targets, run);
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

  // Legacy View: open the first checked event with the checked ids as the
  // Prev/Next scope and playback started (`Id =[] …` + `play=1`).
  const view = () => {
    const monitorId = useEventPlaybackStore.getState().navScope?.monitorId ?? null;
    setNavScope({ monitorId, ids: orderedIds, autoplay: true });
    navigate({ to: '/events/$eventId', params: { eventId: String(orderedIds[0]) } });
  };

  const unarchive = () => runAction(t('Unarchive'), (id) => updateEvent(id, { archived: false }));

  // Legacy refuses to delete an archived event ("Event N is archived, cannot
  // delete it."); we skip those up front and say how many.
  const remove = async () => {
    const targets = ids.filter((id) => !archivedSelected.has(id));
    if (archivedSelected.size > 0) {
      toast.error(t('{{count}} archived event not deleted. Unarchive first.', { count: archivedSelected.size }));
    }
    if (targets.length > 0) await runAction(t('Delete'), (id) => deleteEvent(id), targets);
  };

  const guarded = (e: MouseEvent, action: Exclude<Pending, null>, run: () => Promise<void>) => {
    if (e.shiftKey) void run();
    else setPending(action);
  };
  const confirmPending = async () => {
    await (pending === 'delete' ? remove() : unarchive());
    setPending(null);
  };

  const busy = progress.running;
  const finishedWithFailures = !busy && progress.action && progress.failed.length > 0;
  const progressText = t('{{action}}: {{done}} / {{total}}', {
    action: progress.action, done: progress.done, total: progress.total,
  });

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
        {/* Legacy's #rightButtons carry no count and no clear (events.php:134-140). */}
        {!classic && (
          <>
            <span className="px-2 text-xs tabular-nums font-mono text-fg-muted">
              {t('{{count}} selected', { count: ids.length })}
            </span>
            <div className="w-px h-5 bg-border-subtle mx-1" />
          </>
        )}

        {/* Legacy order: View, Archive, Unarchive, Edit, Export, Download,
            Delete (events.php:134-140). */}
        <BulkBtn
          variant={variant}
          icon={<Eye size={12} />}
          label={t('View')}
          onClick={view}
          disabled={busy || ids.length === 0}
        />
        <RequirePerm feature="events" level="Edit">
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
            title={archivedSelected.size === 0 ? t('Please select an event that is archived.') : t('Unarchive')}
            onClick={(e) => guarded(e, 'unarchive', unarchive)}
            disabled={busy || archivedSelected.size === 0}
          />
          <BulkBtn
            variant={variant}
            icon={<Pencil size={12} />}
            label={t('Edit')}
            onClick={() => setEditOpen(true)}
            disabled={busy || ids.length === 0}
          />
        </RequirePerm>
        <BulkBtn
          variant={variant}
          icon={<ExternalLink size={12} />}
          label={t('Export')}
          onClick={() => setMediaOpen('export')}
          disabled={busy || ids.length === 0}
        />
        <BulkBtn
          variant={variant}
          icon={<Download size={12} />}
          label={t('Download')}
          title={t('Download Video')}
          onClick={() => setMediaOpen('download')}
          disabled={busy || ids.length === 0}
        />
        <RequirePerm feature="events" level="Edit">
          <BulkBtn
            variant={variant}
            icon={<Trash2 size={12} />}
            label={t('Delete')}
            tone="danger"
            onClick={(e) => guarded(e, 'delete', remove)}
            disabled={busy || ids.length === 0}
          />
        </RequirePerm>

        {!classic && (
          <>
            <div className="w-px h-5 bg-border-subtle mx-1" />
            <button
              onClick={() => { dismiss(); onClear(); }}
              disabled={busy}
              aria-label={t('Clear selection')}
              className="p-1.5 rounded transition-colors disabled:opacity-50 text-fg-dim hover:text-fg hover:bg-surface-2"
            >
              <X size={12} />
            </button>
          </>
        )}
      </div>

      {/* Progress while running; result line afterwards. */}
      {busy && (
        <div
          role="status"
          className="flex items-center gap-2 px-2 text-xs font-mono tabular-nums text-fg-muted"
          data-testid="bulk-progress"
        >
          <span>{progressText}</span>
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

      {/* Legacy's delconfirm / eventunarchive modals, with the progress
          ticker inside while the chunks go out. */}
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => { if (!busy) setPending(null); }}
        onConfirm={() => void confirmPending()}
        title={pending === 'delete' ? t('Delete Confirmation') : t('Confirm Unarchive')}
        message={busy
          ? progressText
          : pending === 'delete'
            ? t('Are you sure you wish to delete the selected events?')
            : t('Are you sure you wish to unarchive the selected events?')}
        confirmText={pending === 'delete' ? t('Delete') : t('Unarchive')}
        isLoading={busy}
      />

      <ExportEventsModal
        isOpen={mediaOpen === 'export'}
        onClose={() => setMediaOpen(null)}
        ids={orderedIds}
        events={onPage}
        monitorName={monitorName}
        variant={variant}
      />
      <DownloadVideoModal
        isOpen={mediaOpen === 'download'}
        onClose={() => setMediaOpen(null)}
        ids={orderedIds}
        events={onPage}
        variant={variant}
      />

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
  icon, label, title, onClick, disabled, tone = 'neutral', variant = 'modern',
}: {
  icon: ReactNode;
  label: string;
  title?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
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
  // Classic is icon-only with a tooltip, as legacy's buttons are.
  const iconOnly = variant === 'classic';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? (iconOnly ? label : undefined)}
      aria-label={iconOnly ? label : undefined}
      className={clsx(
        'flex items-center gap-1.5 border text-xs font-medium transition-colors',
        iconOnly ? 'px-2.5 py-1.5' : 'px-2 py-1',
        cls,
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {icon}
      {!iconOnly && label}
    </button>
  );
}
