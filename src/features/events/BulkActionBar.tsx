import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Trash2, X } from 'lucide-react';
import { updateEvent, deleteEvent } from '@/api/events';

interface BulkActionBarProps {
  selectedIds: Set<number>;
  onClear: () => void;
}

/**
 * Sticky action bar that appears at the bottom of the events list once one
 * or more rows are checked. Lets the operator archive / unarchive / delete
 * the whole selection in one go. The backend doesn't expose a bulk endpoint
 * yet, so we fan out one PATCH (or DELETE) per id; mutations report progress
 * via the pending count on each button.
 */
export function BulkActionBar({ selectedIds, onClear }: BulkActionBarProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['recentEvents'] });
  };

  const archiveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await updateEvent(id, { archived: true });
      }
    },
    onSuccess: () => {
      invalidate();
      onClear();
    },
  });
  const unarchiveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await updateEvent(id, { archived: false });
      }
    },
    onSuccess: () => {
      invalidate();
      onClear();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await deleteEvent(id);
      }
    },
    onSuccess: () => {
      invalidate();
      onClear();
    },
  });

  const ids = Array.from(selectedIds);
  if (ids.length === 0) return null;

  const busy = archiveMutation.isPending || unarchiveMutation.isPending || deleteMutation.isPending;

  return (
    <div
      role="region"
      aria-label={t('Bulk event actions')}
      className={clsx(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-30',
        'flex items-center gap-1 px-3 py-2 rounded-xl',
        'bg-panel/95 backdrop-blur-md border border-cyan/40',
        'shadow-[0_8px_32px_rgba(0,0,0,0.4)] shadow-cyan/10',
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
      )}
    >
      <span className="px-2 text-xs font-mono text-cyan tabular-nums">
        {t('{{count}} selected', { count: ids.length })}
      </span>
      <div className="w-px h-5 bg-border-subtle mx-1" />

      <BulkBtn
        icon={<Archive size={12} />}
        label={t('Archive')}
        onClick={() => archiveMutation.mutate(ids)}
        pending={archiveMutation.isPending}
        disabled={busy}
      />
      <BulkBtn
        icon={<ArchiveRestore size={12} />}
        label={t('Unarchive')}
        onClick={() => unarchiveMutation.mutate(ids)}
        pending={unarchiveMutation.isPending}
        disabled={busy}
      />
      <BulkBtn
        icon={<Trash2 size={12} />}
        label={t('Delete')}
        tone="crimson"
        onClick={() => {
          if (confirm(t("Delete {{count}} event? This can't be undone.", { count: ids.length }))) {
            deleteMutation.mutate(ids);
          }
        }}
        pending={deleteMutation.isPending}
        disabled={busy}
      />

      <div className="w-px h-5 bg-border-subtle mx-1" />
      <button
        onClick={onClear}
        disabled={busy}
        aria-label={t('Clear selection')}
        className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function BulkBtn({
  icon, label, onClick, pending, disabled, tone = 'cyan',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  pending: boolean;
  disabled: boolean;
  tone?: 'cyan' | 'crimson';
}) {
  const cls = tone === 'crimson'
    ? 'border-crimson/40 text-crimson hover:bg-crimson/15'
    : 'border-cyan/40 text-cyan hover:bg-cyan/15';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
        cls,
        (disabled || pending) && 'opacity-60 cursor-not-allowed',
      )}
    >
      {icon}
      {label}
      {pending && <span className="font-mono text-[10px] opacity-70">…</span>}
    </button>
  );
}
