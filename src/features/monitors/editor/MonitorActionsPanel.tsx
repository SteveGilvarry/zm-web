import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { buttonClasses, fieldClasses } from '@/components/common/styles';
import type { MonitorActionTrigger, MonitorActionType } from '@/api/monitorActions';
import {
  ACTION_TRIGGERS, actionTriggerLabels, actionTypeLabels, typesFor, type ActionRow,
} from './actionsDraft';
import type { MonitorActionsState } from './useMonitorActions';

/**
 * Modern Actions tab: the monitor's actions as a table with every column
 * the API keeps (label and order included, which legacy's form leaves out),
 * an Add button and a Remove per row. The device list is what
 * `/monitors/{id}/actions/targets` returns, and each row offers only what
 * its device can do. Nothing is sent until the editor's Save.
 */
export function MonitorActionsPanel({ actions }: { actions: MonitorActionsState }) {
  const { t } = useTranslation();
  if (actions.loading) return <p className="text-sm text-fg-dim">{t('Loading…')}</p>;
  if (actions.error) return <p role="alert" className="text-sm text-danger">{(actions.error as Error).message}</p>;
  if (!actions.targets.length && !actions.rows.length) {
    return (
      <p role="status" className="text-sm text-fg-muted">
        {t('No monitor has a control that supports a light or audio playback, so there is nothing to act on yet. Give a monitor a Control entry with Can Light or Can Play Audio first.')}
      </p>
    );
  }
  const field = fieldClasses('sm');
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="monitor-actions">
          <thead>
            <tr className="border-b border-border-subtle text-label text-fg-dim">
              <th className="py-1.5 pe-2 text-start font-normal">{t('On')}</th>
              <th className="py-1.5 pe-2 text-start font-normal">{t('Label')}</th>
              <th className="py-1.5 pe-2 text-start font-normal">{t('When')}</th>
              <th className="py-1.5 pe-2 text-start font-normal">{t('Device')}</th>
              <th className="py-1.5 pe-2 text-start font-normal">{t('Does')}</th>
              <th className="py-1.5 pe-2 text-start font-normal">{t('Sound')}</th>
              <th className="py-1.5 pe-2 text-start font-normal">{t('Order')}</th>
              <th className="py-1.5"><span className="sr-only">{t('Remove')}</span></th>
            </tr>
          </thead>
          <tbody>
            {actions.rows.map((row, i) => (
              <Row key={row.key} row={row} index={i + 1} actions={actions} field={field} />
            ))}
          </tbody>
        </table>
      </div>
      {!actions.rows.length && <p className="text-sm text-fg-dim py-3">{t('No actions yet.')}</p>}
      <button type="button" onClick={() => actions.add()} className={clsx(buttonClasses('secondary', 'sm'), 'mt-3')}>
        <Plus size={12} aria-hidden />
        {t('Add action')}
      </button>
    </div>
  );
}

function Row({ row, index, actions, field }: { row: ActionRow; index: number; actions: MonitorActionsState; field: string }) {
  const { t } = useTranslation();
  const typeLabels = actionTypeLabels(t);
  const triggerLabels = actionTriggerLabels(t);
  const target = actions.targets.find((x) => x.id === row.target_monitor_id);
  const set = (patch: Partial<ActionRow>) => actions.update(row.key, patch);
  const name = (what: string) => t('Action {{n}}: {{what}}', { n: index, what });
  return (
    <tr className="border-b border-border-subtle">
      <td className="py-1.5 pe-2">
        <input type="checkbox" className="accent-accent h-4 w-4" checked={row.enabled}
          aria-label={name(t('Enabled'))} onChange={(e) => set({ enabled: e.target.checked })} />
      </td>
      <td className="py-1.5 pe-2">
        <input type="text" className={clsx(field, 'min-w-[8rem]')} value={row.label}
          aria-label={name(t('Label'))} onChange={(e) => set({ label: e.target.value })} />
      </td>
      <td className="py-1.5 pe-2">
        <select className={field} value={row.trigger_on} aria-label={name(t('When'))}
          onChange={(e) => set({ trigger_on: e.target.value as MonitorActionTrigger })}>
          {ACTION_TRIGGERS.map((v) => <option key={v} value={v}>{triggerLabels[v]}</option>)}
        </select>
      </td>
      <td className="py-1.5 pe-2">
        <select className={field} value={row.target_monitor_id ?? ''} aria-label={name(t('Device'))}
          onChange={(e) => set({ target_monitor_id: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">{t('Choose a device')}</option>
          {actions.targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </td>
      <td className="py-1.5 pe-2">
        <select className={field} value={row.action_type ?? ''} disabled={!target} aria-label={name(t('Does'))}
          onChange={(e) => set({ action_type: e.target.value as MonitorActionType })}>
          {typesFor(target).map((v) => <option key={v} value={v}>{typeLabels[v]}</option>)}
        </select>
      </td>
      <td className="py-1.5 pe-2">
        {row.action_type === 'AudioPlay' && (
          <input type="number" step={1} className={clsx(field, 'w-20 tabular-nums')}
            min={target?.min_audio_file ?? 0} max={target?.max_audio_file ?? undefined}
            value={row.audio_file ?? ''} aria-label={name(t('Sound'))}
            onChange={(e) => set({ audio_file: e.target.value === '' ? null : Number(e.target.value) })} />
        )}
      </td>
      <td className="py-1.5 pe-2">
        <input type="number" step={1} min={0} className={clsx(field, 'w-16 tabular-nums')} value={row.sequence}
          aria-label={name(t('Order'))} onChange={(e) => set({ sequence: Number(e.target.value) || 0 })} />
      </td>
      <td className="py-1.5 text-end">
        <button type="button" onClick={() => actions.remove(row.key)} aria-label={name(t('Remove'))}
          className={clsx(buttonClasses('ghost', 'sm'), 'text-fg-dim hover:text-danger')}>
          <Trash2 size={12} aria-hidden />
        </button>
      </td>
    </tr>
  );
}
