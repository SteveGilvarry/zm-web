import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Filter, Plus, Trash2, Save, Archive, Trash, Clock } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  listFilters, createFilter, updateFilter, deleteFilter,
  parseFilterQuery, serializeFilterQuery,
  type Filter as FilterModel, type FilterQuery,
} from '@/api/filters';
import { RuleBuilder } from '@/features/filters/RuleBuilder';

export const Route = createFileRoute('/filters/')({
  component: FiltersPage,
});

function FiltersPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const filtersQ = useQuery({
    queryKey: ['filters'],
    queryFn: () => listFilters({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const filters = filtersQ.data?.items ?? [];
  const monitors = monitorsQ.data?.items ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftQuery, setDraftQuery] = useState<FilterQuery>({ rules: [] });
  const [draftAutoArchive, setDraftAutoArchive] = useState(false);
  const [draftAutoDelete, setDraftAutoDelete] = useState(false);
  const [draftInterval, setDraftInterval] = useState(0);

  // Load draft from selected filter; reset to empty when nothing's selected.
  const selectedFilter = useMemo(
    () => filters.find((f) => f.id === selectedId) ?? null,
    [filters, selectedId],
  );

  const startEditing = (f: FilterModel | null) => {
    if (f) {
      setSelectedId(f.id);
      setDraftName(f.name);
      setDraftQuery(parseFilterQuery(f.query_json));
      setDraftAutoArchive(f.auto_archive === 1);
      setDraftAutoDelete(f.auto_delete === 1);
      setDraftInterval(f.execute_interval ?? 0);
    } else {
      setSelectedId(null);
      setDraftName('');
      setDraftQuery({ rules: [] });
      setDraftAutoArchive(false);
      setDraftAutoDelete(false);
      setDraftInterval(0);
    }
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['filters'] });

  const createMutation = useMutation({
    mutationFn: () =>
      createFilter({
        name: draftName.trim(),
        query_json: serializeFilterQuery(draftQuery),
        execute_interval: draftInterval,
      }),
    onSuccess: (f) => {
      invalidate();
      setSelectedId(f.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no filter selected');
      return updateFilter(selectedId, {
        name: draftName.trim(),
        query: serializeFilterQuery(draftQuery),
      });
    },
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFilter(id),
    onSuccess: () => {
      invalidate();
      startEditing(null);
    },
  });

  const canSave = draftName.trim().length > 0;

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Filters">
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Saved filter list */}
          <div className="col-span-3">
            <Panel title="Saved" icon={<Filter size={16} />}>
              <button
                onClick={() => startEditing(null)}
                className="flex items-center gap-1 w-full px-2 py-1.5 mb-2 rounded border border-dashed border-border-subtle text-xs text-text-muted hover:border-cyan/40 hover:text-cyan transition-colors"
              >
                <Plus size={11} />
                New filter
              </button>

              <ul className="space-y-0.5 max-h-[60vh] overflow-y-auto">
                {filters.length === 0 ? (
                  <li className="text-xs text-text-muted italic py-4 text-center">
                    No saved filters yet.
                  </li>
                ) : (
                  filters.map((f) => (
                    <li key={f.id}>
                      <div
                        className={clsx(
                          'flex items-center gap-1 px-2 py-1.5 rounded transition-colors',
                          selectedId === f.id
                            ? 'bg-cyan/10 border border-cyan/30'
                            : 'border border-transparent hover:bg-surface/60',
                        )}
                      >
                        <button
                          onClick={() => startEditing(f)}
                          className={clsx(
                            'flex-1 text-left text-xs truncate',
                            selectedId === f.id ? 'text-cyan' : 'text-text-primary',
                          )}
                        >
                          {f.name}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete filter "${f.name}"?`)) deleteMutation.mutate(f.id);
                          }}
                          className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                          aria-label={`Delete ${f.name}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          </div>

          {/* Editor */}
          <div className="col-span-9 space-y-4">
            <Panel
              title={selectedFilter ? `Editing — ${selectedFilter.name}` : 'New filter'}
              icon={<Filter size={16} />}
              action={
                <div className="flex items-center gap-2">
                  {selectedId && (
                    <button
                      onClick={() => updateMutation.mutate()}
                      disabled={!canSave || updateMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded border border-cyan/50 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50"
                    >
                      <Save size={11} />
                      Save
                    </button>
                  )}
                  {!selectedId && (
                    <button
                      onClick={() => createMutation.mutate()}
                      disabled={!canSave || createMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded border border-cyan/50 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} />
                      Create
                    </button>
                  )}
                </div>
              }
            >
              <div className="space-y-4">
                {/* Name */}
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20">
                    Name
                  </label>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Untitled filter"
                    className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
                  />
                </div>

                {/* Rules */}
                <div>
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
                    Conditions
                  </h3>
                  <RuleBuilder
                    query={draftQuery}
                    monitors={monitors}
                    onChange={setDraftQuery}
                  />
                </div>

                {/* Actions */}
                <div>
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
                    Actions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <ActionToggle
                      icon={<Archive size={11} />}
                      label="Auto-archive matches"
                      active={draftAutoArchive}
                      onClick={() => setDraftAutoArchive((v) => !v)}
                    />
                    <ActionToggle
                      icon={<Trash size={11} />}
                      label="Auto-delete matches"
                      tone="crimson"
                      active={draftAutoDelete}
                      onClick={() => setDraftAutoDelete((v) => !v)}
                    />
                    <div className={clsx(
                      'flex items-center gap-2 px-3 py-1.5 rounded border-2',
                      'border-border-subtle bg-surface/50 text-text-secondary',
                    )}>
                      <Clock size={11} />
                      <span className="text-[11px]">Run every</span>
                      <input
                        type="number"
                        min={0}
                        value={draftInterval}
                        onChange={(e) => setDraftInterval(parseInt(e.target.value || '0', 10))}
                        className="w-14 px-1 py-0.5 text-[11px] font-mono text-text-primary bg-surface border border-border-subtle rounded focus:outline-none focus:border-cyan/50"
                      />
                      <span className="text-[11px] text-text-muted">min</span>
                    </div>
                  </div>
                  {(draftAutoArchive || draftAutoDelete) && !selectedId && (
                    <p className="mt-2 text-[10px] text-amber italic">
                      Note: auto-archive / auto-delete take effect only after the filter
                      is saved and the backend filter daemon picks it up.
                    </p>
                  )}
                </div>

                {/* Raw JSON preview (debug aid) */}
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-text-muted hover:text-text-primary">
                    Show raw query JSON
                  </summary>
                  <pre className="mt-2 p-2 rounded bg-abyss border border-border-subtle text-text-secondary overflow-x-auto font-mono">
                    {serializeFilterQuery(draftQuery)}
                  </pre>
                </details>
              </div>
            </Panel>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function ActionToggle({
  icon, label, active, tone = 'cyan', onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'cyan' | 'crimson';
  active: boolean;
  onClick: () => void;
}) {
  const activeCls = tone === 'crimson'
    ? 'border-crimson/60 bg-crimson/15 text-crimson'
    : 'border-cyan/60 bg-cyan/15 text-cyan';
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider rounded border-2 transition-all',
        active ? activeCls : 'border-border-subtle bg-surface/50 text-text-muted hover:border-cyan/40 hover:text-cyan',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
