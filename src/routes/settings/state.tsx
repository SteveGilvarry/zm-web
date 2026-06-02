import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import {
  Activity,
  Layers,
  Play,
  Power,
  RefreshCw,
  Save,
  Trash2,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  listStates,
  createState,
  deleteState,
  applyState,
  changeDaemonState,
  composeDefinition,
  parseDefinition,
  type State,
  type DaemonAction,
} from '@/api/states';

export const Route = createFileRoute('/settings/state')({
  component: RunStatePage,
});

/** Reserved synthetic names from the legacy modal that aren't real saved rows. */
const RESERVED_STATE_NAMES = new Set(['start', 'stop', 'restart']);
/** Default seed row created by ZoneMinder install; safe to apply but never delete. */
const PROTECTED_STATE_NAMES = new Set(['default']);

/**
 * Run-state management. Surfaces the named-state presets stored in
 * `States` and the three daemon supervisor actions (start / stop / restart),
 * which together replace the legacy `?view=state` modal triggered from the
 * RUNNING badge. The header SystemRunningToggle keeps handling the binary
 * start/stop for everyday use.
 */
export function RunStatePage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const statesQ = useQuery({
    queryKey: ['states'],
    queryFn: () => listStates({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors', 'for-state-snapshot'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated,
  });

  const states: State[] = (statesQ.data?.items ?? []).filter(
    (s) => !RESERVED_STATE_NAMES.has(s.name.toLowerCase()),
  );
  const monitors = monitorsQ.data?.items ?? [];

  const invalidateStates = () => {
    qc.invalidateQueries({ queryKey: ['states'] });
    qc.invalidateQueries({ queryKey: ['systemStatus'] });
  };

  const applyMutation = useMutation({
    mutationFn: (name: string) => applyState(name),
    onSuccess: invalidateStates,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteState(id),
    onSuccess: invalidateStates,
  });

  const changeMutation = useMutation({
    mutationFn: (action: DaemonAction) => changeDaemonState(action),
    onSuccess: invalidateStates,
  });

  const saveCurrentMutation = useMutation({
    mutationFn: (name: string) =>
      createState({
        name,
        definition: composeDefinition(monitors),
        is_active: 0,
      }),
    onSuccess: () => {
      invalidateStates();
      setNewStateName('');
    },
  });

  // Confirm dialog state
  const [applyTarget, setApplyTarget] = useState<State | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<State | null>(null);
  const [daemonTarget, setDaemonTarget] = useState<DaemonAction | null>(null);

  const [newStateName, setNewStateName] = useState('');

  if (!isAuthenticated) return null;

  const handleSaveCurrent = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newStateName.trim();
    if (!trimmed) return;
    if (RESERVED_STATE_NAMES.has(trimmed.toLowerCase())) {
      window.alert(`"${trimmed}" is a reserved name. Choose another.`);
      return;
    }
    saveCurrentMutation.mutate(trimmed);
  };

  const busy =
    applyMutation.isPending ||
    deleteMutation.isPending ||
    changeMutation.isPending ||
    saveCurrentMutation.isPending;

  return (
    <AppShell title="Run State">
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Daemon supervisor controls */}
          <div className="col-span-12">
            <Panel title="Daemon supervisor" icon={<Power size={16} />}>
              <p className="text-xs text-text-muted mb-3">
                Toggles the ZoneMinder process tree via <code className="font-mono">zmpkg.pl</code>. Stop will
                halt recording across every monitor; Restart re-launches the supervisor without changing per-monitor
                configuration.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <DaemonButton
                  action="start"
                  icon={<Play size={12} />}
                  label="Start"
                  onClick={() => changeMutation.mutate('start')}
                  disabled={busy}
                  tone="emerald"
                />
                <DaemonButton
                  action="stop"
                  icon={<Power size={12} />}
                  label="Stop"
                  onClick={() => setDaemonTarget('stop')}
                  disabled={busy}
                  tone="crimson"
                />
                <DaemonButton
                  action="restart"
                  icon={<RefreshCw size={12} />}
                  label="Restart"
                  onClick={() => setDaemonTarget('restart')}
                  disabled={busy}
                  tone="amber"
                />
                {changeMutation.isPending && (
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Loader2 size={11} className="animate-spin" />
                    Sending…
                  </span>
                )}
                {changeMutation.isSuccess && !changeMutation.isPending && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={12} />
                    {changeMutation.data?.message ?? 'OK'}
                  </span>
                )}
                {changeMutation.isError && (
                  <span className="text-xs text-crimson" role="alert">
                    {(changeMutation.error as Error)?.message ?? 'Failed'}
                  </span>
                )}
              </div>
            </Panel>
          </div>

          {/* Saved states list */}
          <div className="col-span-12 lg:col-span-8">
            <Panel
              title="Saved states"
              icon={<Layers size={16} />}
              noPadding
            >
              {statesQ.isLoading ? (
                <div className="p-6 text-center text-text-muted text-sm">Loading states…</div>
              ) : statesQ.isError ? (
                <div className="p-6 text-center text-crimson text-sm" role="alert">
                  Failed to load states: {(statesQ.error as Error)?.message}
                </div>
              ) : states.length === 0 ? (
                <div className="p-6 text-center text-text-muted text-sm">
                  No saved states yet. Snapshot the current monitor configuration on the right.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Active</th>
                      <th className="px-3 py-2 text-left">Definition</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((s) => {
                      const isProtected = PROTECTED_STATE_NAMES.has(s.name.toLowerCase());
                      const parsed = parseDefinition(s.definition);
                      const preview =
                        parsed.length === 0
                          ? '—'
                          : `${parsed.length} monitor${parsed.length === 1 ? '' : 's'}`;
                      return (
                        <tr
                          key={s.id}
                          className="border-b border-border-subtle/40 hover:bg-surface/40"
                        >
                          <td className="px-3 py-2 font-medium text-text-primary">{s.name}</td>
                          <td className="px-3 py-2">
                            {s.is_active === 1 ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-mono uppercase">
                                <Activity size={10} />
                                Active
                              </span>
                            ) : (
                              <span className="text-text-muted text-[10px] font-mono uppercase">—</span>
                            )}
                          </td>
                          <td
                            className="px-3 py-2 text-text-muted font-mono truncate max-w-[18rem]"
                            title={s.definition}
                          >
                            {preview}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => setApplyTarget(s)}
                                disabled={busy || s.is_active === 1}
                                aria-label={`Apply state ${s.name}`}
                                className={clsx(
                                  'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-wider border transition-colors',
                                  s.is_active === 1
                                    ? 'border-border-subtle text-text-muted cursor-not-allowed opacity-60'
                                    : 'border-cyan/40 text-cyan hover:bg-cyan/15',
                                )}
                              >
                                <Play size={10} />
                                Apply
                              </button>
                              <button
                                onClick={() => setDeleteTarget(s)}
                                disabled={busy || isProtected}
                                aria-label={`Delete state ${s.name}`}
                                title={isProtected ? '"default" cannot be deleted' : 'Delete state'}
                                className={clsx(
                                  'p-1 rounded transition-colors',
                                  isProtected
                                    ? 'text-text-dim cursor-not-allowed'
                                    : 'text-text-muted hover:text-crimson hover:bg-crimson/10',
                                )}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          {/* Save current */}
          <div className="col-span-12 lg:col-span-4">
            <Panel title="Save current as…" icon={<Save size={16} />}>
              <p className="text-xs text-text-muted mb-3">
                Snapshots every monitor's <span className="font-mono">Capturing</span>/
                <span className="font-mono">Analysing</span>/<span className="font-mono">Recording</span> mode
                into a new named state.
              </p>
              <form onSubmit={handleSaveCurrent} className="space-y-2">
                <input
                  value={newStateName}
                  onChange={(e) => setNewStateName(e.target.value)}
                  placeholder="e.g. Away, Holiday"
                  aria-label="New state name"
                  className="w-full px-2 py-1.5 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
                />
                <button
                  type="submit"
                  disabled={
                    !newStateName.trim() ||
                    saveCurrentMutation.isPending ||
                    monitorsQ.isLoading ||
                    monitors.length === 0
                  }
                  className={clsx(
                    'w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2',
                    'border-cyan/60 bg-cyan/15 text-cyan',
                    'hover:bg-cyan/25 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {saveCurrentMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  Save snapshot
                </button>
                {saveCurrentMutation.isError && (
                  <p className="text-[11px] text-crimson" role="alert">
                    {(saveCurrentMutation.error as Error)?.message ?? 'Save failed'}
                  </p>
                )}
                <p className="text-[10px] text-text-muted">
                  {monitors.length} monitor{monitors.length === 1 ? '' : 's'} will be captured.
                </p>
              </form>
            </Panel>
          </div>
        </div>
      </main>

      {/* Apply confirm */}
      <ConfirmDialog
        isOpen={!!applyTarget}
        onClose={() => setApplyTarget(null)}
        onConfirm={() => {
          if (applyTarget) {
            applyMutation.mutate(applyTarget.name);
            setApplyTarget(null);
          }
        }}
        title="Apply run state"
        message={
          applyTarget
            ? `Apply state "${applyTarget.name}"? Every monitor's Capturing / Analysing / Recording mode will be overwritten and affected daemons restarted.`
            : ''
        }
        confirmText="Apply"
        variant="warning"
        isLoading={applyMutation.isPending}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Delete state"
        message={
          deleteTarget
            ? `Delete saved state "${deleteTarget.name}"? This removes the preset only — it does not change any monitor's current mode.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Daemon action confirm — stop / restart get a prompt, start does not */}
      <ConfirmDialog
        isOpen={daemonTarget === 'stop' || daemonTarget === 'restart'}
        onClose={() => setDaemonTarget(null)}
        onConfirm={() => {
          if (daemonTarget) {
            changeMutation.mutate(daemonTarget);
            setDaemonTarget(null);
          }
        }}
        title={daemonTarget === 'stop' ? 'Stop ZoneMinder' : 'Restart ZoneMinder'}
        message={
          daemonTarget === 'stop'
            ? 'Stop ZoneMinder? Recording will halt across every monitor.'
            : 'Restart ZoneMinder? Capture streams will reconnect after a short outage.'
        }
        confirmText={daemonTarget === 'stop' ? 'Stop' : 'Restart'}
        variant={daemonTarget === 'stop' ? 'danger' : 'warning'}
        isLoading={changeMutation.isPending}
      />

    </AppShell>
  );
}

interface DaemonButtonProps {
  action: DaemonAction;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: 'emerald' | 'crimson' | 'amber';
}

function DaemonButton({ icon, label, onClick, disabled, tone }: DaemonButtonProps) {
  const toneCls =
    tone === 'emerald'
      ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15'
      : tone === 'crimson'
        ? 'border-crimson/40 text-crimson hover:bg-crimson/15'
        : 'border-amber/40 text-amber hover:bg-amber/15';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1 px-3 py-1.5 rounded font-mono text-[11px] uppercase tracking-wider border-2 transition-colors',
        toneCls,
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
