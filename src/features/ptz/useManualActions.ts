import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listMonitorActions, runMonitorAction, type MonitorAction, type MonitorActionType } from '@/api/monitorActions';
import type { Monitor } from '@/types';

/** One button on the watch page's control panel. */
export interface ManualActionButton {
  id: number;
  label: string;
}

export interface ManualActionsState {
  actions: ManualActionButton[];
  /** Run one action; the promise rejects with the backend's error. */
  run: (actionId: number) => Promise<unknown>;
}

/**
 * The enabled `Manual` rows in legacy order (`Sequence`, then `Id`), as
 * control_functions.php `monitorActionControls` picks them. Pure, so the
 * filter and order can be tested without a request.
 */
export function manualActions(rows: readonly MonitorAction[]): MonitorAction[] {
  return rows
    .filter((a) => a.trigger_on === 'Manual' && a.enabled)
    .sort((a, b) => a.sequence - b.sequence || a.id - b.id);
}

/**
 * This monitor's hand-run actions (zm-api#179), labelled as legacy labels
 * them: the row's own label, or `translate('Action'.Type).' - '.Target`.
 * They usually drive another device (a speaker), so they are offered even
 * when this monitor has no control of its own. A target that is not in
 * `monitors` is skipped, as legacy skips a target it cannot load.
 */
export function useManualActions(
  monitorId: number,
  enabled: boolean,
  monitors: readonly Monitor[],
): ManualActionsState {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['monitorActions', monitorId],
    queryFn: () => listMonitorActions(monitorId),
    enabled,
    retry: false,
    staleTime: 60_000,
  });

  // Legacy's `ActionLightOn` & co. from en_gb.php.
  const typeLabel = (type: MonitorActionType | null | undefined): string => {
    switch (type) {
      case 'LightOn': return t('Turn light on');
      case 'LightOff': return t('Turn light off');
      case 'IndicatorLightOn': return t('Turn indicator on');
      case 'IndicatorLightOff': return t('Turn indicator off');
      case 'AudioPlay': return t('Play sound');
      case 'AudioStop': return t('Stop sound');
      default: return type ?? '';
    }
  };

  const names = new Map(monitors.map((m) => [m.id, m.name]));
  const actions: ManualActionButton[] = [];
  for (const a of manualActions(q.data ?? [])) {
    const target = names.get(a.target_monitor_id);
    if (target === undefined) continue;
    actions.push({ id: a.id, label: a.label || `${typeLabel(a.action_type)} - ${target}` });
  }

  return {
    actions,
    run: (actionId) => runMonitorAction(monitorId, actionId),
  };
}
