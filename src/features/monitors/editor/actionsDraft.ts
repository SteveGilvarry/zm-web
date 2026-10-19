/**
 * The Actions tab's rows, as legacy `monitor.php` (`case 'actions'`) and
 * `monitor.js` (`updateMonitorActionRow`) edit them, and the per-row API
 * calls a save turns into. Pure, so the save plan is tested without a page.
 *
 * Legacy rules kept here:
 *  - a row with no device is unused: dropped if new, deleted if stored
 *    (`includes/actions/monitor.php`);
 *  - the type list is what the device supports; with no device, all types;
 *  - a sound file starts at the device's minimum when Play sound is picked;
 *  - a row whose type the device cannot do is not saved.
 */
import type {
  MonitorAction, MonitorActionInput, MonitorActionTarget, MonitorActionTrigger, MonitorActionType,
} from '@/api/monitorActions';
import type { Translate } from './fields';

export const ACTION_TYPES: readonly MonitorActionType[] = [
  'LightOn', 'LightOff', 'IndicatorLightOn', 'IndicatorLightOff', 'AudioPlay', 'AudioStop',
];
export const ACTION_TRIGGERS: readonly MonitorActionTrigger[] = ['EventStart', 'EventEnd', 'Alarm', 'AlarmEnd', 'Manual'];

/** Legacy `$all_type_options`. */
export function actionTypeLabels(t: Translate): Record<MonitorActionType, string> {
  return {
    LightOn: t('Turn light on'),
    LightOff: t('Turn light off'),
    IndicatorLightOn: t('Turn indicator on'),
    IndicatorLightOff: t('Turn indicator off'),
    AudioPlay: t('Play sound'),
    AudioStop: t('Stop sound'),
  };
}

/** Legacy `$trigger_options`. */
export function actionTriggerLabels(t: Translate): Record<MonitorActionTrigger, string> {
  return {
    EventStart: t('Event starts'),
    EventEnd: t('Event ends'),
    Alarm: t('Alarm begins'),
    AlarmEnd: t('Alarm ends'),
    Manual: t('Manually triggered'),
  };
}

export interface ActionRow {
  /** Stable React key; the stored id for a loaded row. */
  key: string;
  id: number | null;
  enabled: boolean;
  label: string;
  trigger_on: MonitorActionTrigger;
  target_monitor_id: number | null;
  action_type: MonitorActionType | null;
  audio_file: number | null;
  sequence: number;
}

export function rowFromAction(a: MonitorAction): ActionRow {
  return {
    key: `id-${a.id}`,
    id: a.id,
    enabled: a.enabled,
    label: a.label ?? '',
    trigger_on: a.trigger_on ?? 'EventStart',
    target_monitor_id: a.target_monitor_id,
    action_type: a.action_type ?? null,
    audio_file: a.audio_file ?? null,
    sequence: a.sequence,
  };
}

/** Legacy orders by `Sequence`, then `Id`. */
export function rowsFromActions(actions: MonitorAction[]): ActionRow[] {
  return [...actions].sort((a, b) => a.sequence - b.sequence || a.id - b.id).map(rowFromAction);
}

let nextKey = 0;
/** A blank row with `MonitorAction`'s defaults: enabled, Event starts, Play sound, no device. */
export function blankRow(sequence = 0): ActionRow {
  nextKey += 1;
  return {
    key: `new-${nextKey}`, id: null, enabled: true, label: '', trigger_on: 'EventStart',
    target_monitor_id: null, action_type: 'AudioPlay', audio_file: null, sequence,
  };
}

/** The types offered for a row's device: the device's own, or all of them with no device chosen. */
export function typesFor(target: MonitorActionTarget | undefined): readonly MonitorActionType[] {
  return target && target.types.length ? target.types : ACTION_TYPES;
}

/**
 * Apply `patch` the way `updateMonitorActionRow` reacts to a change: the
 * type snaps to the first the device supports when the old one is not
 * among them, and Play sound starts its file at the device's minimum.
 */
export function updateRow(row: ActionRow, patch: Partial<ActionRow>, targets: MonitorActionTarget[]): ActionRow {
  const next = { ...row, ...patch };
  const target = targets.find((x) => x.id === next.target_monitor_id);
  const types = typesFor(target);
  if (target && (next.action_type == null || !types.includes(next.action_type))) next.action_type = types[0] ?? null;
  if (next.action_type === 'AudioPlay' && next.audio_file == null && target?.min_audio_file != null) {
    next.audio_file = target.min_audio_file;
  }
  return next;
}

export interface ActionPlan {
  creates: MonitorActionInput[];
  updates: Array<{ id: number; input: Partial<MonitorActionInput> }>;
  deletes: number[];
}

/** What a row would send, or null when it is unused or its device cannot do its type. */
function inputOf(row: ActionRow, targets: MonitorActionTarget[]): MonitorActionInput | null {
  if (row.target_monitor_id == null || row.action_type == null) return null;
  const target = targets.find((x) => x.id === row.target_monitor_id);
  // With the target list loaded, only what the device supports is saved
  // (legacy logs "Ignoring action" and skips it); the server checks again.
  if (target && !target.types.includes(row.action_type)) return null;
  return {
    target_monitor_id: row.target_monitor_id,
    action_type: row.action_type,
    trigger_on: row.trigger_on,
    audio_file: row.audio_file,
    label: row.label,
    enabled: row.enabled,
    sequence: row.sequence,
  };
}

/** The per-row API calls that take `baseline` to `rows`. */
export function planActionChanges(
  baseline: ActionRow[],
  rows: ActionRow[],
  targets: MonitorActionTarget[],
): ActionPlan {
  const plan: ActionPlan = { creates: [], updates: [], deletes: [] };
  const kept = new Set<number>();
  for (const row of rows) {
    const input = inputOf(row, targets);
    if (row.id == null) {
      if (input) plan.creates.push(input);
      continue;
    }
    const before = baseline.find((b) => b.id === row.id);
    // No device is legacy's way of removing an action: the delete below picks it up.
    if (!before || row.target_monitor_id == null) continue;
    kept.add(row.id);
    if (!input) continue;
    const was = inputOf(before, []) ?? ({} as Partial<MonitorActionInput>);
    const changed: Partial<MonitorActionInput> = {};
    for (const k of Object.keys(input) as Array<keyof MonitorActionInput>) {
      if ((input[k] ?? null) !== (was[k] ?? null)) (changed as Record<string, unknown>)[k] = input[k];
    }
    if (Object.keys(changed).length) plan.updates.push({ id: row.id, input: changed });
  }
  for (const b of baseline) if (b.id != null && !kept.has(b.id)) plan.deletes.push(b.id);
  return plan;
}

export function planSize(plan: ActionPlan): number {
  return plan.creates.length + plan.updates.length + plan.deletes.length;
}
