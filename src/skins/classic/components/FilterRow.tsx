import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { Monitor } from '@/types';
import {
  ANALYSING_OPTIONS,
  CAPTURING_OPTIONS,
  RECORDING_OPTIONS,
  RUNTIME_STATUS_OPTIONS,
  type FilterRowField,
  type MonitorFilterRowState,
} from '@/features/monitors/useMonitorFilterRow';
import { classicInputClass } from './Select';

interface ClassicFilterRowProps {
  /** Every monitor — the Monitor select lists them. */
  monitors: Monitor[];
  state: MonitorFilterRowState;
  className?: string;
  /** `dark` for the legacy blue-grey header band (white labels). */
  tone?: 'light' | 'dark';
}

/**
 * Legacy `_monitor_filters.php`: GroupId · Name · Capturing · Analysing ·
 * Recording · Status · Source · Monitor, label above each control, a clear
 * (×) button inside every select.
 */
export function ClassicFilterRow({ monitors, state, className, tone = 'light' }: ClassicFilterRowProps) {
  const { t } = useTranslation();
  const { values, set, clear, groups } = state;

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
        label={t('GroupId')} field="groupId" value={values.groupId} set={set} clear={clear}
        options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
      />
      <TextField label={t('Name')} field="name" value={values.name} set={set} />
      <SelectField
        label={t('Capturing')} field="capturing" value={values.capturing} set={set} clear={clear}
        options={CAPTURING_OPTIONS.map((v) => ({ value: v, label: modeLabel(v) }))}
      />
      <SelectField
        label={t('Analysing')} field="analysing" value={values.analysing} set={set} clear={clear}
        options={ANALYSING_OPTIONS.map((v) => ({ value: v, label: modeLabel(v) }))}
      />
      <SelectField
        label={t('Recording')} field="recording" value={values.recording} set={set} clear={clear}
        options={RECORDING_OPTIONS.map((v) => ({ value: v, label: modeLabel(v) }))}
      />
      <SelectField
        label={t('Status')} field="status" value={values.status} set={set} clear={clear}
        options={RUNTIME_STATUS_OPTIONS.map((v) => ({ value: v, label: statusLabel(v) }))}
      />
      <TextField label={t('Source')} field="source" value={values.source} set={set} />
      <SelectField
        label={t('Monitor')} field="monitorId" value={values.monitorId} set={set} clear={clear} wide
        options={monitors.map((m) => ({ value: String(m.id), label: `${m.id} ${m.name}` }))}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col items-center gap-0.5 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label, field, value, set,
}: { label: string; field: FilterRowField; value: string; set: MonitorFilterRowState['set'] }) {
  const { t } = useTranslation();
  return (
    <Field label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => set(field, e.target.value)}
        placeholder={t('text or regular expression')}
        className={clsx(classicInputClass, 'w-44 text-zinc-900')}
      />
    </Field>
  );
}

function SelectField({
  label, field, value, set, clear, options, wide,
}: {
  label: string;
  field: FilterRowField;
  value: string;
  set: MonitorFilterRowState['set'];
  clear: MonitorFilterRowState['clear'];
  options: Array<{ value: string; label: string }>;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label}>
      <span className={clsx('inline-flex items-stretch rounded-sm border border-zinc-400 bg-white', wide ? 'w-64' : 'w-36')}>
        <select
          value={value}
          onChange={(e) => set(field, e.target.value)}
          className="flex-1 min-w-0 bg-transparent px-1.5 py-0.5 text-sm text-zinc-900 focus:outline-none"
        >
          <option value="">{t('All')}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => clear(field)}
          disabled={!value}
          aria-label={t('Clear {{label}}', { label: label.toLocaleLowerCase() })}
          className="px-1.5 border-s border-zinc-300 text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300"
        >
          <X size={12} aria-hidden />
        </button>
      </span>
    </Field>
  );
}
