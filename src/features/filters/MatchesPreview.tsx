import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Eye, X, Loader2, Archive, Trash2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { getEvents, updateEvent, deleteEvent } from '@/api/events';
import { evaluateFilter } from './evaluate';
import type { FilterQuery } from '@/api/filters';

interface MatchesPreviewProps {
  query: FilterQuery;
  autoArchive: boolean;
  autoDelete: boolean;
}

/**
 * Side-panel that previews the events a filter would match and lets the
 * operator execute its configured actions (archive / delete) right now.
 * Pulls the most recent 200 events and replays the rule set client-side.
 *
 * The preview row count plus the "Run actions on N matches" button mirror
 * the legacy ZM filter UI's 'List Matches' and 'Execute' controls.
 */
export function MatchesPreview({ query, autoArchive, autoDelete }: MatchesPreviewProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Lazy-load the candidate set the first time the panel opens.
  const eventsQ = useQuery({
    queryKey: ['events', 'filterPreview'],
    queryFn: () => getEvents({ page: 1, page_size: 200 }),
    enabled: open,
  });

  const matches = useMemo(
    () => evaluateFilter(query, eventsQ.data?.items ?? []),
    [query, eventsQ.data],
  );

  const executeMutation = useMutation({
    mutationFn: async () => {
      // Apply each configured action to every match. PATCH / DELETE per id
      // — same fan-out pattern as the BulkActionBar.
      for (const e of matches) {
        if (autoDelete) {
          await deleteEvent(e.id);
        } else if (autoArchive) {
          await updateEvent(e.id, { archived: true });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const hasAction = autoArchive || autoDelete;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border-2 transition-all',
            open
              ? 'border-cyan/60 bg-cyan/15 text-cyan'
              : 'border-border-subtle bg-surface/50 text-text-muted hover:border-cyan/40 hover:text-cyan',
          )}
        >
          {open ? <X size={11} /> : <Eye size={11} />}
          {open ? 'Hide matches' : 'List matches'}
        </button>

        {hasAction && (
          <button
            type="button"
            onClick={() => {
              if (matches.length === 0) {
                alert('No matches to act on.');
                return;
              }
              const action = autoDelete ? 'delete' : 'archive';
              if (confirm(`Run "${action}" on ${matches.length} matching events? This can't be undone.`)) {
                executeMutation.mutate();
              }
            }}
            disabled={executeMutation.isPending || !open || matches.length === 0}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border-2 transition-all',
              autoDelete
                ? 'border-crimson/60 bg-crimson/15 text-crimson hover:bg-crimson/25'
                : 'border-amber/60 bg-amber/15 text-amber hover:bg-amber/25',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {executeMutation.isPending
              ? <Loader2 size={11} className="animate-spin" />
              : autoDelete ? <Trash2 size={11} /> : <Archive size={11} />}
            Execute now
          </button>
        )}

        {open && (
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted ml-1">
            {eventsQ.isFetching
              ? 'loading…'
              : `${matches.length} of ${eventsQ.data?.items.length ?? 0} (last 200) match`}
          </span>
        )}
      </div>

      {open && (
        <div className="border border-border-subtle rounded-md bg-surface/50 overflow-hidden">
          {eventsQ.isLoading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-text-muted text-xs">
              <Loader2 size={12} className="animate-spin" />
              Loading candidate events…
            </div>
          ) : matches.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-xs italic">
              No events match these conditions yet.
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle/40 max-h-60 overflow-y-auto">
              {matches.slice(0, 50).map((e) => (
                <li key={e.id} className="px-3 py-1.5 flex items-center gap-3 text-xs hover:bg-surface/80">
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: String(e.id) }}
                    className="font-mono text-cyan hover:underline"
                  >
                    #{e.id}
                  </Link>
                  <span className="text-text-primary truncate flex-1">{e.name}</span>
                  <span className="text-text-muted">{e.cause}</span>
                  <span className="font-mono text-text-secondary tabular-nums whitespace-nowrap">
                    {e.start_date_time
                      ? new Date(e.start_date_time).toLocaleString([], {
                          month: 'short', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', hour12: false,
                        })
                      : ''}
                  </span>
                  {e.archived === 1 && (
                    <span className="text-[10px] text-amber">archived</span>
                  )}
                </li>
              ))}
              {matches.length > 50 && (
                <li className="px-3 py-2 text-[10px] text-text-muted text-center italic">
                  …and {matches.length - 50} more not shown
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
