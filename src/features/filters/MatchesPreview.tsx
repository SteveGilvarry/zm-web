import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Eye, X, Loader2, Archive, ArchiveRestore, Trash2, ChevronLeft, ChevronRight, Download, LayoutGrid } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { updateEvent, deleteEvent } from '@/api/events';
import type { FilterQuery } from '@/api/filters';
import { useToast } from '@/components/common/toastStore';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { downloadCsv } from '@/features/logs/csv';
import type { Monitor } from '@/types';
import { matchesToCsv } from './matchesCsv';
import type { ReviewSearch } from './reviewLink';
import { useFilterPreview, CLIENT_PREVIEW_WINDOW } from './useFilterPreview';

interface MatchesPreviewProps {
  query: FilterQuery;
  monitors: Monitor[];
  /** Which of the draft's actions "Execute now" should apply. */
  actions: { archive: boolean; unarchive: boolean; delete: boolean };
  /** Legacy "View Matches" target (Montage Review framed by the terms). */
  reviewSearch?: ReviewSearch;
  /** Flat classic buttons instead of the Mission Control toggles. */
  variant?: 'modern' | 'classic';
}

/**
 * "List matches" + "Execute now", the legacy filter page's two preview
 * controls. Matching is delegated to `useFilterPreview`, which uses the
 * backend preview endpoint when it can and says so when it cannot.
 *
 * Execute applies delete / archive / unarchive to the events currently
 * listed (one page in server mode), mirroring what the daemon would do for
 * them. The counts in the confirm prompt are for exactly that set.
 */
export function MatchesPreview({ query, monitors, actions, reviewSearch, variant = 'modern' }: MatchesPreviewProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const classic = variant === 'classic';

  const preview = useFilterPreview(query, { monitors, enabled: open });
  const listed = preview.items;

  const executeMutation = useMutation({
    mutationFn: async () => {
      for (const e of listed) {
        if (actions.delete) await deleteEvent(e.id);
        else if (actions.archive) await updateEvent(e.id, { archived: true });
        else if (actions.unarchive) await updateEvent(e.id, { archived: false });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['filters', 'preview'] });
      toast.success(t('Applied to {{count}} event', { count: listed.length }));
    },
    onError: toast.apiError,
  });

  const hasAction = actions.archive || actions.unarchive || actions.delete;

  const monitorName = (id: number) => monitors.find((m) => m.id === id)?.name ?? String(id);
  const exportMatches = () => {
    const csv = matchesToCsv(listed, monitorName, (id) => (id === 0 ? t('Default') : String(id)));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCsv(`zm-filter-matches-${stamp}.csv`, csv);
  };

  const btn = (active: boolean, tone: 'accent' | 'warn' | 'danger' = 'accent') => classic
    ? clsx(
      'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase border rounded-sm',
      tone === 'danger'
        ? 'bg-[#d9534f] border-[#d43f3a] text-white hover:bg-[#c9302c]'
        : active ? 'bg-[#286090] border-[#204d74] text-white' : 'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090]',
      'disabled:opacity-50 disabled:cursor-not-allowed',
    )
    : clsx(
      'flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors',
      tone === 'danger'
        ? 'border-danger/40 text-danger hover:bg-danger/10'
        : tone === 'warn'
          ? 'border-warn/40 text-warn hover:bg-warn/10'
          : active
            ? 'border-accent/50 bg-accent/12 text-accent'
            : 'border-border-subtle bg-surface text-fg-muted hover:text-fg hover:border-border',
      'disabled:opacity-40 disabled:cursor-not-allowed',
    );

  const counter = () => {
    if (preview.isFetching && !preview.items.length) return t('loading…');
    if (preview.mode === 'server') {
      return t('{{count}} match (server preview)', { count: preview.total });
    }
    return t('{{matched}} of the last {{window}} match (client preview)', {
      matched: preview.total,
      window: preview.windowSize || CLIENT_PREVIEW_WINDOW,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={btn(open)}
        >
          {open ? <X size={11} /> : <Eye size={11} />}
          {open ? t('Hide matches') : t('List matches')}
        </button>

        {reviewSearch && (
          <Link to="/montagereview" search={reviewSearch} className={btn(false)} title={t('Open Montage Review framed by these conditions')}>
            <LayoutGrid size={11} />
            {t('View matches')}
          </Link>
        )}

        <button
          type="button"
          onClick={() => { if (!open) setOpen(true); else exportMatches(); }}
          disabled={open && listed.length === 0}
          title={open ? t('Download the listed matches as CSV') : t('List matches first, then export the page')}
          className={btn(false)}
        >
          <Download size={11} />
          {t('Export matches')}
        </button>

        {hasAction && (
          <RequirePerm feature="events" level="Edit">
          <button
            type="button"
            onClick={() => {
              if (listed.length === 0) {
                alert(t('No matches to act on.'));
                return;
              }
              const prompt = actions.delete
                ? t("Delete {{count}} listed events? This can't be undone.", { count: listed.length })
                : actions.archive
                  ? t('Archive {{count}} listed events?', { count: listed.length })
                  : t('Unarchive {{count}} listed events?', { count: listed.length });
              if (confirm(prompt)) executeMutation.mutate();
            }}
            disabled={executeMutation.isPending || !open || listed.length === 0}
            className={btn(false, actions.delete ? 'danger' : 'warn')}
          >
            {executeMutation.isPending
              ? <Loader2 size={11} className="animate-spin" />
              : actions.delete ? <Trash2 size={11} />
                : actions.archive ? <Archive size={11} /> : <ArchiveRestore size={11} />}
            {t('Execute')}
          </button>
          </RequirePerm>
        )}

        {open && (
          <span className="ms-1 text-xs text-fg-dim">
            {counter()}
          </span>
        )}
      </div>

      {open && preview.mode === 'client' && (
        <p className="text-xs text-warn">
          {t('Server preview cannot run this filter ({{reasons}}); showing a best-effort match over the most recent events. The background daemon evaluates the full rule set.', {
            reasons: preview.reasons.join('; '),
          })}
          {preview.unevaluable.length > 0 && (
            <>
              {' '}
              {t('Treated as matching: {{attrs}}.', { attrs: preview.unevaluable.join(', ') })}
            </>
          )}
        </p>
      )}
      {open && preview.mode === 'server' && preview.notes.length > 0 && (
        <p className="text-xs text-fg-dim">{preview.notes.join('; ')}</p>
      )}
      {open && preview.error && (
        <p className="text-xs text-danger" role="alert">
          {t('Preview failed: {{message}}', { message: preview.error.message })}
        </p>
      )}

      {open && (
        <div className="border border-border-subtle rounded bg-surface overflow-hidden">
          {preview.isLoading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-fg-dim text-xs">
              <Loader2 size={12} className="animate-spin" />
              {t('Loading candidate events…')}
            </div>
          ) : listed.length === 0 ? (
            <div className="p-6 text-center text-fg-dim text-xs">
              {t('No events match these conditions yet.')}
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle max-h-60 overflow-y-auto">
              {listed.map((e) => (
                <li key={e.id} className="px-3 py-1 flex items-center gap-3 text-xs hover:bg-surface-2">
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: String(e.id) }}
                    className="font-mono tabular-nums text-fg-muted hover:text-accent transition-colors"
                  >
                    #{e.id}
                  </Link>
                  <span className="text-fg truncate flex-1">{e.name}</span>
                  <span className="text-fg-dim">{e.cause}</span>
                  <span className="font-mono tabular-nums text-fg-muted whitespace-nowrap">
                    {e.start_date_time
                      ? new Date(e.start_date_time).toLocaleString([], {
                          month: 'short', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', hour12: false,
                        })
                      : ''}
                  </span>
                  {e.archived === 1 && (
                    <span className="text-xs text-fg-dim">{t('archived')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {preview.mode === 'server' && preview.lastPage > 1 && (
            <div className="flex items-center justify-between px-3 py-1 border-t border-border-subtle text-xs text-fg-dim">
              <button
                type="button"
                onClick={() => preview.setPage(preview.page - 1)}
                disabled={preview.page <= 1}
                aria-label={t('Previous page')}
                className="p-1 rounded hover:text-fg disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={12} className="rtl:-scale-x-100" />
              </button>
              <span className="font-mono tabular-nums">
                {t('Page {{page}} of {{last}}', { page: preview.page, last: preview.lastPage })}
              </span>
              <button
                type="button"
                onClick={() => preview.setPage(preview.page + 1)}
                disabled={preview.page >= preview.lastPage}
                aria-label={t('Next page')}
                className="p-1 rounded hover:text-fg disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={12} className="rtl:-scale-x-100" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
