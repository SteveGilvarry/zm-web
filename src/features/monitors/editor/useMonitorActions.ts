import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMonitorAction, deleteMonitorAction, listMonitorActions, listMonitorActionTargets, updateMonitorAction,
} from '@/api/monitorActions';
import {
  blankRow, planActionChanges, planSize, rowsFromActions, updateRow, type ActionRow,
} from './actionsDraft';

/**
 * The Actions tab's draft for one monitor: the stored rows, the devices
 * they can drive, the edits, and the per-row calls a save makes. Actions
 * are their own rows (`/monitors/{id}/actions`), not part of the monitor
 * PATCH, so the editor runs {@link persist} after the PATCH.
 *
 * `monitorId` null (a new monitor) loads nothing: there is nothing to
 * attach actions to until the monitor exists. `load` holds the two
 * requests back until the tab is first opened, since the box rate-limits
 * and most edits never touch actions.
 */
export function useMonitorActions(monitorId: number | null, load = true) {
  const qc = useQueryClient();
  const enabled = monitorId != null && load;
  const actionsQ = useQuery({
    queryKey: ['monitor-actions', monitorId],
    queryFn: () => listMonitorActions(monitorId!),
    enabled,
  });
  const targetsQ = useQuery({
    queryKey: ['monitor-action-targets', monitorId],
    queryFn: () => listMonitorActionTargets(monitorId!),
    enabled,
    staleTime: 60_000,
  });
  const targets = useMemo(() => targetsQ.data ?? [], [targetsQ.data]);
  const baseline = useMemo(() => rowsFromActions(actionsQ.data ?? []), [actionsQ.data]);

  // null = untouched, so a refetch shows through until the operator edits.
  const [draft, setDraft] = useState<ActionRow[] | null>(null);
  const rows = draft ?? baseline;
  const plan = useMemo(() => planActionChanges(baseline, rows, targets), [baseline, rows, targets]);

  const update = (key: string, patch: Partial<ActionRow>) =>
    setDraft((d) => (d ?? baseline).map((r) => (r.key === key ? updateRow(r, patch, targets) : r)));
  /** Append a row, optionally already edited (classic's spare row turning into a real one). */
  const add = (patch: Partial<ActionRow> = {}) =>
    setDraft((d) => {
      const cur = d ?? baseline;
      const seq = cur.reduce((m, r) => Math.max(m, r.sequence), 0) + (cur.length ? 1 : 0);
      return [...cur, updateRow(blankRow(seq), patch, targets)];
    });
  const remove = (key: string) => setDraft((d) => (d ?? baseline).filter((r) => r.key !== key));

  /** Run the plan against `id`, then show the server's rows again. */
  const persist = async (id: number) => {
    for (const actionId of plan.deletes) await deleteMonitorAction(id, actionId);
    for (const u of plan.updates) await updateMonitorAction(id, u.id, u.input);
    for (const c of plan.creates) await createMonitorAction(id, c);
  };
  const settle = () => {
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ['monitor-actions', monitorId] });
  };

  return {
    rows,
    targets,
    loading: enabled && (actionsQ.isLoading || targetsQ.isLoading),
    error: actionsQ.error ?? targetsQ.error,
    /** Rows a save would create, change or delete. */
    changeCount: planSize(plan),
    update,
    add,
    remove,
    persist,
    settle,
    reset: () => setDraft(null),
  };
}

export type MonitorActionsState = ReturnType<typeof useMonitorActions>;
