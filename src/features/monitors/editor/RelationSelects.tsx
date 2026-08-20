/**
 * Lookup widgets for the monitor editor's relationship fields: values that
 * are foreign keys into other tables (manufacturer, model, storage area,
 * server, PTZ return preset, linked monitors, group membership). Each one
 * owns its own query; the editor only sees a `FieldValue` in and out so
 * the diff / PATCH logic stays generic.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Plus } from 'lucide-react';
import { listManufacturers, createManufacturer } from '@/api/manufacturers';
import { listModels, createModel } from '@/api/models';
import { getStorageList } from '@/api/storage';
import { listServers } from '@/api/servers';
import { listControlPresets } from '@/api/controlPresets';
import { getMonitors } from '@/api/monitors';
import { listGroups } from '@/api/groups';
import { useToast } from '@/components/common/toastStore';
import type { FieldValue } from './fields';
import { parseIdList, serializeIdList } from './editorState';

interface LookupProps {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  className: string;
}

const NEW_SENTINEL = '__new__';

/* ------------------------------------------------------------------------ */
/*  Generic creatable select                                                */
/* ------------------------------------------------------------------------ */

interface CreatableSelectProps extends LookupProps {
  options: Array<{ id: number; label: string }>;
  isLoading: boolean;
  isError: boolean;
  /** Label for the `null` choice. */
  noneLabel: string;
  /** Shown when the list fails to load; the select stays usable. */
  errorLabel: string;
  /** Resolves to the new row's id. Omit to hide the "enter new" row. */
  onCreate?: (name: string) => Promise<number>;
  createPlaceholder?: string;
}

/**
 * The legacy "select or enter new" control: a select whose last option
 * swaps in a text box + Add button; the created row becomes the value.
 */
export function CreatableSelect({
  value, onChange, className, options, isLoading, isError, noneLabel, errorLabel, onCreate, createPlaceholder,
}: CreatableSelectProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [entering, setEntering] = useState(false);
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: (n: string) => onCreate!(n),
    onSuccess: (id) => {
      onChange(id);
      setEntering(false);
      setName('');
    },
    onError: toast.apiError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (name.trim()) create.mutate(name.trim());
  };

  return (
    <div>
      <select
        value={entering ? NEW_SENTINEL : value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === NEW_SENTINEL) { setEntering(true); return; }
          setEntering(false);
          onChange(raw === '' ? null : Number(raw));
        }}
        disabled={isLoading}
        className={clsx(className, 'cursor-pointer')}
      >
        <option value="">{noneLabel}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        {onCreate && <option value={NEW_SENTINEL}>{t('Enter new…')}</option>}
      </select>
      {entering && (
        <form onSubmit={submit} className="flex items-center gap-2 mt-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={createPlaceholder}
            aria-label={t('New entry name')}
            className={clsx(className, 'flex-1')}
          />
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-cyan/50 text-cyan hover:bg-cyan/10 disabled:opacity-40"
          >
            {create.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            {t('Add')}
          </button>
          <button
            type="button"
            onClick={() => { setEntering(false); setName(''); }}
            className="px-2 py-1.5 text-xs text-text-muted hover:text-text-primary"
          >
            {t('Cancel')}
          </button>
        </form>
      )}
      {isError && <p className="text-[10px] text-crimson mt-1">{errorLabel}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Concrete lookups                                                        */
/* ------------------------------------------------------------------------ */

export function ManufacturerSelect(props: LookupProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => listManufacturers({ page: 1, page_size: 500 }),
    staleTime: 5 * 60_000,
  });
  return (
    <CreatableSelect
      {...props}
      options={(q.data?.items ?? []).map((m) => ({ id: m.id, label: m.name }))}
      isLoading={q.isLoading}
      isError={q.isError}
      noneLabel={t('None')}
      errorLabel={t('Could not load manufacturers.')}
      createPlaceholder={t('Manufacturer name')}
      onCreate={async (name) => {
        const row = await createManufacturer(name);
        await qc.invalidateQueries({ queryKey: ['manufacturers'] });
        return row.id;
      }}
    />
  );
}

/** Models are scoped to the draft's manufacturer, as in the legacy form. */
export function ModelSelect({ manufacturerId, ...props }: LookupProps & { manufacturerId: number | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['models', manufacturerId],
    queryFn: () => listModels({ page: 1, page_size: 500, manufacturer_id: manufacturerId ?? undefined }),
    staleTime: 5 * 60_000,
  });
  return (
    <CreatableSelect
      {...props}
      options={(q.data?.items ?? []).map((m) => ({ id: m.id, label: m.name }))}
      isLoading={q.isLoading}
      isError={q.isError}
      noneLabel={t('None')}
      errorLabel={t('Could not load models.')}
      createPlaceholder={t('Model name')}
      onCreate={async (name) => {
        const row = await createModel({ name, manufacturer_id: manufacturerId });
        await qc.invalidateQueries({ queryKey: ['models'] });
        return row.id;
      }}
    />
  );
}

export function StorageSelect({ value, onChange, className }: LookupProps) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['storage', { page_size: 200 }],
    queryFn: () => getStorageList({ page: 1, page_size: 200 }),
    staleTime: 5 * 60_000,
  });
  const items = q.data?.items ?? [];
  return (
    <div>
      <select
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        disabled={q.isLoading}
        className={clsx(className, 'cursor-pointer')}
      >
        {items.length === 0 && <option value="">{t('Default')}</option>}
        {items.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.path ? ` — ${s.path}` : ''}</option>
        ))}
      </select>
      {q.isError && <p className="text-[10px] text-crimson mt-1">{t('Could not load storage areas.')}</p>}
    </div>
  );
}

export function ServerSelect({ value, onChange, className }: LookupProps) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['servers', { page_size: 200 }],
    queryFn: () => listServers({ page: 1, page_size: 200 }),
    staleTime: 5 * 60_000,
  });
  return (
    <div>
      <select
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        disabled={q.isLoading}
        className={clsx(className, 'cursor-pointer')}
      >
        <option value="">{t('Any (single-server)')}</option>
        {(q.data?.items ?? []).map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.hostname ? ` (${s.hostname})` : ''}</option>
        ))}
      </select>
      {q.isError && <p className="text-[10px] text-crimson mt-1">{t('Could not load servers.')}</p>}
    </div>
  );
}

/**
 * Return location: -1 none, 0 Home, or a saved PTZ preset slot for this
 * monitor (legacy lists `ControlPresets` rows after the two sentinels).
 */
export function ReturnLocationSelect({ monitorId, value, onChange, className }: LookupProps & { monitorId: number }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['control_presets', monitorId],
    queryFn: () => listControlPresets({ monitor_id: monitorId, page: 1, page_size: 200 }),
    staleTime: 60_000,
  });
  const presets = q.data?.items ?? [];
  const current = value == null ? -1 : Number(value);
  const known = current <= 0 || presets.some((p) => p.preset === current);
  return (
    <div>
      <select
        value={String(current)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={clsx(className, 'cursor-pointer')}
      >
        <option value="-1">{t('None (no return)')}</option>
        <option value="0">{t('Home preset')}</option>
        {presets.map((p) => (
          <option key={p.preset} value={p.preset}>{t('Preset {{n}}: {{label}}', { n: p.preset, label: p.label })}</option>
        ))}
        {!known && <option value={String(current)}>{t('Preset {{n}}', { n: current })}</option>}
      </select>
      {q.isError && <p className="text-[10px] text-crimson mt-1">{t('Could not load PTZ presets.')}</p>}
    </div>
  );
}

/** Checkbox list of every other monitor; stored as a comma-separated id string. */
export function LinkedMonitorsSelect({ selfId, value, onChange }: LookupProps & { selfId: number }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['monitors', { page_size: 500 }],
    queryFn: () => getMonitors({ page: 1, page_size: 500 }),
    staleTime: 60_000,
  });
  const selected = new Set(parseIdList(value));
  const others = (q.data?.items ?? []).filter((m) => m.id !== selfId);
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(serializeIdList([...next]));
  };
  if (q.isLoading) return <p className="text-xs text-text-muted">{t('Loading…')}</p>;
  if (others.length === 0) return <p className="text-xs text-text-muted">{t('No other monitors to link.')}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {others.map((m) => (
        <label
          key={m.id}
          className={clsx(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer select-none',
            selected.has(m.id) ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-border-subtle text-text-secondary hover:border-text-secondary/50',
          )}
        >
          <input
            type="checkbox"
            className="accent-cyan"
            checked={selected.has(m.id)}
            onChange={() => toggle(m.id)}
          />
          <span className="font-mono text-[10px] text-text-muted">{m.id}</span>
          {m.name}
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Group membership                                                        */
/* ------------------------------------------------------------------------ */

/** Checkbox list of every group; `value` is the draft membership. */
export function GroupsMembership({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['groups', { page_size: 500 }],
    queryFn: () => listGroups({ page: 1, page_size: 500 }),
    staleTime: 60_000,
  });
  const groups = q.data?.items ?? [];
  const selected = new Set(value);
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next].sort((a, b) => a - b));
  };
  if (q.isLoading) return <p className="text-xs text-text-muted">{t('Loading…')}</p>;
  if (q.isError) return <p className="text-[10px] text-crimson">{t('Could not load groups.')}</p>;
  if (groups.length === 0) return <p className="text-xs text-text-muted">{t('No groups defined.')}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => (
        <label
          key={g.id}
          className={clsx(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer select-none',
            selected.has(g.id) ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-border-subtle text-text-secondary hover:border-text-secondary/50',
          )}
        >
          <input type="checkbox" className="accent-cyan" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
          {g.name}
        </label>
      ))}
    </div>
  );
}
