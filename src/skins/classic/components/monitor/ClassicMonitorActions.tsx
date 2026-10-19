import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ACTION_TRIGGERS, actionTriggerLabels, actionTypeLabels, blankRow, typesFor, type ActionRow,
} from '@/features/monitors/editor/actionsDraft';
import type { MonitorActionsState } from '@/features/monitors/editor/useMonitorActions';
import type { MonitorActionTrigger, MonitorActionType } from '@/api/monitorActions';

const SPARE = blankRow();
const cell = 'px-2 py-1 align-middle';
const input = 'px-1 py-0.5 text-sm bg-white border border-zinc-400 rounded-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500';

/**
 * Legacy Actions tab (`monitor.php` `case 'actions'`): the warning when no
 * device can do anything, otherwise the help line, a table of Enabled /
 * When / Device / Does / Sound with one spare blank row at the bottom, and
 * the line saying how to remove one (set its device to None and save).
 * Saved with the rest of the form by the editor's Save.
 */
export function ClassicMonitorActions({ actions }: { actions: MonitorActionsState }) {
  const { t } = useTranslation();
  // Keyed on the row count, so a fresh spare appears once the last one becomes a real row.
  const spare = { ...SPARE, key: `spare-${actions.rows.length}` };

  if (actions.loading) return <p className="text-sm text-zinc-500">{t('Loading…')}</p>;
  if (actions.error) return <p role="alert" className="text-sm text-[#a94442]">{(actions.error as Error).message}</p>;
  if (!actions.targets.length && !actions.rows.length) {
    return (
      <p role="status" className="px-3 py-2 text-sm rounded-sm border border-[#faebcc] bg-[#fcf8e3] text-[#8a6d3b]">
        {t('No monitor has a control that supports a light or audio playback, so there is nothing to act on yet. Give a monitor a Control entry with Can Light or Can Play Audio first.')}
      </p>
    );
  }

  return (
    <div className="text-sm text-zinc-900">
      <p className="text-zinc-500 mb-2">
        {t('Actions this monitor performs when it alarms. The device acted on need not be this monitor - a camera can sound a speaker elsewhere. Only devices whose control capabilities support an action are offered.')}
      </p>
      <table className="w-full border-collapse" data-testid="monitor-actions">
        <thead>
          <tr className="border-b-2 border-zinc-300 text-start">
            <th className={clsx(cell, 'text-start')}>{t('Enabled')}</th>
            <th className={clsx(cell, 'text-start')}>{t('When')}</th>
            <th className={clsx(cell, 'text-start')}>{t('Device')}</th>
            <th className={clsx(cell, 'text-start')}>{t('Does')}</th>
            <th className={clsx(cell, 'text-start')}>{t('Sound')}</th>
          </tr>
        </thead>
        <tbody>
          {actions.rows.map((row, i) => (
            <ActionRowView key={row.key} index={i + 1} row={row} actions={actions}
              onChange={(patch) => actions.update(row.key, patch)} />
          ))}
          <ActionRowView key={spare.key} index={actions.rows.length + 1} row={spare} actions={actions}
            onChange={(patch) => actions.add(patch)} />
        </tbody>
      </table>
      <p className="text-zinc-500 mt-2">{t('To remove an action, set its device to None and save.')}</p>
    </div>
  );
}

function ActionRowView({
  row, index, actions, onChange,
}: { row: ActionRow; index: number; actions: MonitorActionsState; onChange: (patch: Partial<ActionRow>) => void }) {
  const { t } = useTranslation();
  const typeLabels = actionTypeLabels(t);
  const triggerLabels = actionTriggerLabels(t);
  const target = actions.targets.find((x) => x.id === row.target_monitor_id);
  const types = typesFor(target);
  const takesFile = row.action_type === 'AudioPlay';
  const name = (what: string) => t('Action {{n}}: {{what}}', { n: index, what });
  return (
    <tr className="border-b border-zinc-200">
      <td className={cell}>
        <input type="checkbox" checked={row.enabled} aria-label={name(t('Enabled'))}
          onChange={(e) => onChange({ enabled: e.target.checked })} />
      </td>
      <td className={cell}>
        <select className={input} value={row.trigger_on} aria-label={name(t('When'))}
          onChange={(e) => onChange({ trigger_on: e.target.value as MonitorActionTrigger })}>
          {ACTION_TRIGGERS.map((v) => <option key={v} value={v}>{triggerLabels[v]}</option>)}
        </select>
      </td>
      <td className={cell}>
        <select className={input} value={row.target_monitor_id ?? ''} aria-label={name(t('Device'))}
          onChange={(e) => onChange({ target_monitor_id: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">{t('None')}</option>
          {actions.targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </td>
      <td className={cell}>
        {/* With no device there is nothing to constrain the list to: all types, greyed out (monitor.js). */}
        <select className={input} value={row.action_type ?? ''} disabled={!target} aria-label={name(t('Does'))}
          onChange={(e) => onChange({ action_type: e.target.value as MonitorActionType })}>
          {types.map((v) => <option key={v} value={v}>{typeLabels[v]}</option>)}
        </select>
      </td>
      <td className={cell}>
        <input
          type="number" step={1}
          min={target?.min_audio_file ?? 0}
          max={target?.max_audio_file ?? undefined}
          value={row.audio_file ?? ''}
          aria-label={name(t('Sound'))}
          className={clsx(input, 'w-20', !takesFile && 'invisible')}
          onChange={(e) => onChange({ audio_file: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </td>
    </tr>
  );
}
