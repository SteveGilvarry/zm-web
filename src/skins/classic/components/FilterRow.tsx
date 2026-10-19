import { useId, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ANALYSING_OPTIONS,
  CAPTURING_OPTIONS,
  RECORDING_OPTIONS,
  RUNTIME_STATUS_OPTIONS,
  type FilterRowField,
  type MonitorFilterRowState,
} from '@/features/monitors/useMonitorFilterRow';
import { classicInputClass } from './Select';
import { ClassicChosen } from './Chosen';

interface ClassicFilterRowProps {
  state: MonitorFilterRowState;
  className?: string;
  /** `dark` for the legacy blue-grey header band (white labels). */
  tone?: 'light' | 'dark';
}

/**
 * Legacy `_monitor_filters.php`: GroupId · Name · Capturing · Analysing ·
 * Recording · Server? · Storage? · Status · Source · Monitor, label above
 * each control. Every select is a Chosen multi-select with "All" as its
 * placeholder and ZM's clear (×) button over its corner; Server and Storage
 * appear only when the box has more than one.
 */
export function ClassicFilterRow({ state, className, tone = 'light' }: ClassicFilterRowProps) {
  const { t } = useTranslation();
  const { valuesMulti, values, set, setMulti, clear, groupOptions, monitorOptions, servers, storages } = state;

  const modeLabel = (v: string): string => {
    switch (v) {
      case 'None': return t('None');
      case 'Ondemand': return t('On Demand');
      case 'Always': return t('Always');
      case 'OnMotion': return t('On Motion');
      default: return v;
    }
  };
  const statusLabel = (v: string): string => {
    switch (v) {
      case 'Unknown': return t('Unknown');
      case 'NotRunning': return t('Not Running');
      case 'Running': return t('Not Capturing');
      case 'Connected': return t('Capturing');
      case 'Deleted': return t('Deleted');
      default: return v;
    }
  };

  return (
    <div
      role="group"
      aria-label={t('Monitor filter bar')}
      className={clsx(
        'flex flex-wrap items-end justify-center gap-x-3 gap-y-2',
        tone === 'dark' ? 'text-white' : 'text-zinc-800',
        className,
      )}
    >
      <SelectField
        label={t('GroupId')} field="groupId" value={valuesMulti.groupId} set={setMulti} clear={clear}
        // Legacy indents each child three &nbsp; per level (Group.php).
        options={groupOptions.map((g) => ({ value: String(g.id), label: '\u00a0'.repeat(3 * g.depth) + g.name }))}
      />
      <TextField label={t('Name')} field="name" value={values.name} set={set} />
      <SelectField
        label={t('Capturing')} field="capturing" value={valuesMulti.capturing} set={setMulti} clear={clear}
        options={CAPTURING_OPTIONS.map((v) => ({ value: v, label: modeLabel(v) }))}
      />
      <SelectField
        label={t('Analysing')} field="analysing" value={valuesMulti.analysing} set={setMulti} clear={clear}
        options={ANALYSING_OPTIONS.map((v) => ({ value: v, label: modeLabel(v) }))}
      />
      <SelectField
        label={t('Recording')} field="recording" value={valuesMulti.recording} set={setMulti} clear={clear}
        options={RECORDING_OPTIONS.map((v) => ({ value: v, label: modeLabel(v) }))}
      />
      {servers.length > 1 && (
        <SelectField
          label={t('Server')} field="serverId" value={valuesMulti.serverId} set={setMulti} clear={clear}
          options={servers.map((s) => ({ value: String(s.id), label: s.name }))}
        />
      )}
      {storages.length > 1 && (
        <SelectField
          label={t('Storage')} field="storageId" value={valuesMulti.storageId} set={setMulti} clear={clear}
          options={storages.map((s) => ({ value: String(s.id), label: s.name }))}
        />
      )}
      <SelectField
        label={t('Status')} field="status" value={valuesMulti.status} set={setMulti} clear={clear}
        options={RUNTIME_STATUS_OPTIONS.map((v) => ({ value: v, label: statusLabel(v) }))}
      />
      <TextField label={t('Source')} field="source" value={values.source} set={set} />
      <SelectField
        label={t('Monitor')} field="monitorId" value={valuesMulti.monitorId} set={setMulti} clear={clear} wide
        // Only the monitors the other fields let through, as legacy lists them.
        options={monitorOptions.map((m) => ({ value: String(m.id), label: `${m.id} ${m.name}` }))}
      />
    </div>
  );
}

/**
 * Legacy's `.term`: a `<label>` beside the control, not around it. Wrapping
 * the Chosen widget in a label would make every click inside it re-fire on
 * the first chip's × (label activation) and undo the pick just made.
 */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-0.5 text-sm">
      <label htmlFor={htmlFor} className="font-semibold">{label}</label>
      {children}
    </span>
  );
}

function TextField({
  label, field, value, set,
}: { label: string; field: FilterRowField; value: string; set: MonitorFilterRowState['set'] }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => set(field, e.target.value)}
        placeholder={t('text or regular expression')}
        className={clsx(classicInputClass, 'h-[29px] w-44 rounded-[4px] border-[#c8c8c8] text-zinc-900')}
      />
    </Field>
  );
}

function SelectField({
  label, field, value, set, clear, options, wide,
}: {
  label: string;
  field: FilterRowField;
  /** Selected values — legacy's selects are all `multiple`. */
  value: string[];
  set: MonitorFilterRowState['setMulti'];
  clear: MonitorFilterRowState['clear'];
  options: Array<{ value: string; label: string }>;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <ClassicChosen
        id={id}
        label={label}
        options={options}
        value={value}
        // Legacy's `data-placeholder="All"`: an empty selection is "all".
        placeholder={t('All')}
        onChange={(next) => (next.length === 0 ? clear(field) : set(field, next))}
        // Legacy: `.chosen-container { min-width: 11em }` in the control header.
        className={wide ? 'w-72' : 'w-44'}
      />
    </Field>
  );
}
