import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Filter, Plus, Trash2, Save, Archive, Trash, Clock, Video, Terminal,
  Mail, MessageSquare, Copy, Move, Activity, Lock, Layers,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  listFilters, createFilter, updateFilter, deleteFilter,
  parseFilterQuery, serializeFilterQuery,
  type Filter as FilterModel, type FilterQuery, type FilterActions, type FilterOptions,
} from '@/api/filters';
import { RuleBuilder } from '@/features/filters/RuleBuilder';
import { MatchesPreview } from '@/features/filters/MatchesPreview';

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
  // Extended auto-* actions and filter-options surface (P19). Backend's
  // FilterResponse only carries auto_archive / auto_delete / execute_interval
  // / email_format as first-class columns, so the remaining flags ride in
  // query_json.actions and query_json.options. See src/api/filters.ts.
  const [draftActions, setDraftActions] = useState<FilterActions>({});
  const [draftOptions, setDraftOptions] = useState<FilterOptions>({});

  // Load draft from selected filter; reset to empty when nothing's selected.
  const selectedFilter = useMemo(
    () => filters.find((f) => f.id === selectedId) ?? null,
    [filters, selectedId],
  );

  const startEditing = (f: FilterModel | null) => {
    if (f) {
      const q = parseFilterQuery(f.query_json);
      setSelectedId(f.id);
      setDraftName(f.name);
      setDraftQuery(q);
      setDraftAutoArchive(f.auto_archive === 1);
      setDraftAutoDelete(f.auto_delete === 1);
      setDraftInterval(f.execute_interval ?? 0);
      setDraftActions(q.actions ?? {});
      setDraftOptions(q.options ?? {});
    } else {
      setSelectedId(null);
      setDraftName('');
      setDraftQuery({ rules: [] });
      setDraftAutoArchive(false);
      setDraftAutoDelete(false);
      setDraftInterval(0);
      setDraftActions({});
      setDraftOptions({});
    }
  };

  /**
   * Compose the serialised query JSON. We always re-attach `actions` and
   * `options` from the dedicated state so they round-trip via query_json
   * even though the backend doesn't model them as columns.
   */
  const composeQueryJson = (): string => {
    const q: FilterQuery = {
      ...draftQuery,
      actions: {
        ...draftActions,
        auto_archive: draftAutoArchive,
        auto_delete: draftAutoDelete,
      },
      options: draftOptions,
    };
    return serializeFilterQuery(q);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['filters'] });

  const createMutation = useMutation({
    mutationFn: () =>
      createFilter({
        name: draftName.trim(),
        query_json: composeQueryJson(),
        execute_interval: draftInterval,
        email_format: draftActions.email_format ?? null,
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
        query: composeQueryJson(),
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
                      label="Auto-archive"
                      active={draftAutoArchive}
                      onClick={() => setDraftAutoArchive((v) => !v)}
                    />
                    <ActionToggle
                      icon={<Trash size={11} />}
                      label="Auto-delete"
                      tone="crimson"
                      active={draftAutoDelete}
                      onClick={() => setDraftAutoDelete((v) => !v)}
                    />
                    <ActionToggle
                      icon={<Video size={11} />}
                      label="Auto-video"
                      active={!!draftActions.auto_video}
                      onClick={() =>
                        setDraftActions((a) => ({ ...a, auto_video: !a.auto_video }))
                      }
                    />
                    <ActionToggle
                      icon={<Terminal size={11} />}
                      label="Auto-execute"
                      active={!!draftActions.auto_execute}
                      onClick={() =>
                        setDraftActions((a) => ({ ...a, auto_execute: !a.auto_execute }))
                      }
                    />
                    <ActionToggle
                      icon={<Mail size={11} />}
                      label="Auto-email"
                      active={!!draftActions.auto_email}
                      onClick={() =>
                        setDraftActions((a) => ({ ...a, auto_email: !a.auto_email }))
                      }
                    />
                    <ActionToggle
                      icon={<MessageSquare size={11} />}
                      label="Auto-message"
                      active={!!draftActions.auto_message}
                      onClick={() =>
                        setDraftActions((a) => ({ ...a, auto_message: !a.auto_message }))
                      }
                    />
                    <ActionToggle
                      icon={<Copy size={11} />}
                      label="Auto-copy"
                      active={!!draftActions.auto_copy}
                      onClick={() =>
                        setDraftActions((a) => ({ ...a, auto_copy: !a.auto_copy }))
                      }
                    />
                    <ActionToggle
                      icon={<Move size={11} />}
                      label="Auto-move"
                      active={!!draftActions.auto_move}
                      onClick={() =>
                        setDraftActions((a) => ({ ...a, auto_move: !a.auto_move }))
                      }
                    />
                  </div>

                  {/* Conditional sub-inputs for the actions that take operands. */}
                  {draftActions.auto_execute && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20">
                        Command
                      </label>
                      <input
                        type="text"
                        value={draftActions.auto_execute_cmd ?? ''}
                        onChange={(e) =>
                          setDraftActions((a) => ({ ...a, auto_execute_cmd: e.target.value }))
                        }
                        placeholder="/usr/local/bin/notify.sh %EI%"
                        className="flex-1 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
                      />
                    </div>
                  )}

                  {draftActions.auto_email && (
                    <div className="mt-2 space-y-2 border-l-2 border-cyan/30 pl-3">
                      <EmailField
                        label="To"
                        value={draftActions.email_to ?? ''}
                        onChange={(v) => setDraftActions((a) => ({ ...a, email_to: v }))}
                        placeholder="ops@example.com, alerts@example.com"
                      />
                      <EmailField
                        label="Subject"
                        value={draftActions.email_subject ?? ''}
                        onChange={(v) => setDraftActions((a) => ({ ...a, email_subject: v }))}
                        placeholder="ZoneMinder alert"
                      />
                      <div className="flex items-start gap-3">
                        <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20 pt-1">
                          Body
                        </label>
                        <textarea
                          value={draftActions.email_body ?? ''}
                          onChange={(e) =>
                            setDraftActions((a) => ({ ...a, email_body: e.target.value }))
                          }
                          placeholder="Event %EI% on %MN% at %ED%"
                          rows={3}
                          className="flex-1 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20">
                          Format
                        </label>
                        <select
                          value={draftActions.email_format ?? 'Individual'}
                          onChange={(e) =>
                            setDraftActions((a) => ({ ...a, email_format: e.target.value }))
                          }
                          className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
                        >
                          <option value="Individual">Individual (one email per event)</option>
                          <option value="Summary">Summary (one email per run)</option>
                        </select>
                      </div>
                      <EmailField
                        label="Server"
                        value={draftActions.email_server ?? ''}
                        onChange={(v) => setDraftActions((a) => ({ ...a, email_server: v }))}
                        placeholder="smtp.example.com (optional override)"
                      />
                    </div>
                  )}

                  {draftActions.auto_copy && (
                    <StorageField
                      label="Copy to"
                      value={draftActions.auto_copy_to ?? null}
                      onChange={(v) => setDraftActions((a) => ({ ...a, auto_copy_to: v }))}
                    />
                  )}
                  {draftActions.auto_move && (
                    <StorageField
                      label="Move to"
                      value={draftActions.auto_move_to ?? null}
                      onChange={(v) => setDraftActions((a) => ({ ...a, auto_move_to: v }))}
                    />
                  )}

                  {(draftAutoArchive || draftAutoDelete || draftActions.auto_video
                      || draftActions.auto_email || draftActions.auto_message
                      || draftActions.auto_execute || draftActions.auto_copy
                      || draftActions.auto_move) && !selectedId && (
                    <p className="mt-2 text-[10px] text-amber italic">
                      Note: auto-* actions only fire after the filter is saved and the
                      backend filter daemon picks it up.
                    </p>
                  )}
                </div>

                {/* Options panel (background / concurrent / lock_rows / interval) */}
                <div>
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
                    Options
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <ActionToggle
                      icon={<Activity size={11} />}
                      label="Background"
                      active={!!draftOptions.background}
                      onClick={() =>
                        setDraftOptions((o) => ({ ...o, background: !o.background }))
                      }
                    />
                    <ActionToggle
                      icon={<Layers size={11} />}
                      label="Concurrent"
                      active={!!draftOptions.concurrent}
                      onClick={() =>
                        setDraftOptions((o) => ({ ...o, concurrent: !o.concurrent }))
                      }
                    />
                    <ActionToggle
                      icon={<Lock size={11} />}
                      label="Lock rows"
                      active={!!draftOptions.lock_rows}
                      onClick={() =>
                        setDraftOptions((o) => ({ ...o, lock_rows: !o.lock_rows }))
                      }
                    />
                    <div className={clsx(
                      'flex items-center gap-2 px-3 py-1.5 rounded border-2',
                      'border-border-subtle bg-surface/50 text-text-secondary',
                    )}>
                      <Clock size={11} />
                      <span className="text-[11px]">Execute interval</span>
                      <input
                        type="number"
                        min={0}
                        value={draftInterval}
                        onChange={(e) => setDraftInterval(parseInt(e.target.value || '0', 10))}
                        className="w-16 px-1 py-0.5 text-[11px] font-mono text-text-primary bg-surface border border-border-subtle rounded focus:outline-none focus:border-cyan/50"
                      />
                      <span className="text-[11px] text-text-muted">sec</span>
                    </div>
                  </div>
                </div>

                {/* List matches + Execute now — preview against the last 200
                    events and dispatch the configured actions on demand. */}
                <div>
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
                    Preview
                  </h3>
                  <MatchesPreview
                    query={draftQuery}
                    autoArchive={draftAutoArchive}
                    autoDelete={draftAutoDelete}
                  />
                </div>

                {/* Raw JSON preview (debug aid) */}
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-text-muted hover:text-text-primary">
                    Show raw query JSON
                  </summary>
                  <pre className="mt-2 p-2 rounded bg-abyss border border-border-subtle text-text-secondary overflow-x-auto font-mono">
                    {composeQueryJson()}
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

function EmailField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
      />
    </div>
  );
}

/**
 * Storage-target selector for auto_copy / auto_move. We don't have a typed
 * storage list wired in here yet, so accept a free-form integer id. Sentinel
 * values from legacy: empty/null = "unspecified", 0 = "Zero" placeholder.
 */
function StorageField({
  label, value, onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20">
        {label}
      </label>
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : parseInt(v, 10));
        }}
        placeholder="storage id (blank = unspecified)"
        className="w-72 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
      />
    </div>
  );
}
