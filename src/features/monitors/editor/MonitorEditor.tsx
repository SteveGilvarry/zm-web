import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  X, Save, Undo2, Loader2, ChevronRight, AlertCircle, Eye, EyeOff, Trash2, Shuffle,
  MonitorPlay, RefreshCw, PencilRuler, ExternalLink,
} from 'lucide-react';
import { deleteMonitor, patchMonitor } from '@/api/monitors-crud';
import { listControls } from '@/api/controls';
import { attachMonitorToGroup, detachMonitorFromGroup } from '@/api/groups';
import { ApiClientError } from '@/api/client';
import { useToast } from '@/components/common/toastStore';
import { RequirePerm } from '@/features/auth/RequirePerm';
import type { Monitor } from '@/types';
import {
  TABS, useMonitorTabs, visibleFields, validateDraft, fieldErrorsFromDetails, tabForField,
  RESOLUTION_PRESETS,
  type FieldDef, type TabDef, type FieldValue, type FieldErrors,
} from './fields';
import {
  ManufacturerSelect, ModelSelect, StorageSelect, ServerSelect, ReturnLocationSelect,
  LinkedMonitorsSelect, GroupsMembership,
} from './RelationSelects';
import { useGroupMembership } from './useGroupMembership';
import { extractEditableFields, sameValue, sameIdSet, randomHexColour, HEX_COLOUR } from './editorState';

interface MonitorEditorProps {
  monitor: Monitor;
  onClose: () => void;
  /**
   * Called after the monitor has been deleted. Defaults to `onClose`; the
   * watch page should navigate away instead, since the monitor is gone.
   */
  onDeleted?: () => void;
}

/**
 * Full monitor editor — the dashboard's replacement for the legacy ZM
 * monitor-edit page. The legacy UI piled ~120 fields into 11 tabs with no
 * change-tracking, no inline help and a submit-or-cancel flow. This editor
 * keeps the tab layout (operators are trained on it) and the legacy header
 * verbs (Save / Save and Close / Cancel / Delete, Watch / Cycle / Zones
 * links) but adds:
 *
 *  - explicit diff tracking — every changed field gets a cyan marker dot,
 *    the footer shows a count, and Save only PATCHes the keys that changed
 *  - type-dependent Source widgets, as the legacy form swaps on `type`
 *  - client validation plus backend 422 details mapped onto the fields
 *  - group membership edited in place (attach / detach on save)
 *  - confirm-discard if the user closes with unsaved changes
 *
 * Implemented as an in-page overlay rather than a separate route so the
 * back button returns the operator to the live detail view instantly.
 *
 * Keyed on `monitor.id`: draft + baseline reset only when the underlying
 * monitor identity flips (rare — the route would have to navigate). Mid-edit
 * refetches of the *same* monitor leave the in-progress draft untouched.
 */
export function MonitorEditor(props: MonitorEditorProps) {
  return <MonitorEditorBody key={props.monitor.id} {...props} />;
}

function MonitorEditorBody({ monitor, onClose, onDeleted }: MonitorEditorProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  // Translated tab/field labels for rendering; the module-level TABS (English
  // snapshot) is only used by the pure key/diff helpers below.
  const tabs = useMonitorTabs();
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const [draft, setDraft] = useState<Record<string, FieldValue>>(() =>
    extractEditableFields(monitor),
  );
  // Baseline lives in state — not a ref — so updates after a save retrigger
  // the diff memo. Refs don't cause renders, which earlier kept the "N
  // unsaved changes" footer stuck after a successful PATCH.
  const [baseline, setBaseline] = useState<Record<string, FieldValue>>(() =>
    extractEditableFields(monitor),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Group membership is not a monitor column: it is a set of groups-monitors
  // rows. Draft `null` = untouched (follows the server); an array = edited.
  const membership = useGroupMembership(monitor.id);
  const [groupsDraft, setGroupsDraft] = useState<number[] | null>(null);
  const groupsValue = groupsDraft ?? membership.baseline;
  const groupsDirty = groupsDraft != null && !sameIdSet(groupsDraft, membership.baseline);

  // Diff = keys whose draft value differs from baseline.
  const diff = useMemo(() => {
    const out: Record<string, FieldValue> = {};
    for (const [k, v] of Object.entries(draft)) {
      const orig = baseline[k];
      if (!sameValue(v, orig)) out[k] = v;
    }
    return out;
  }, [draft, baseline]);

  // Per-tab diff counts so the rail badges stay live. Keys are counted once
  // even when a tab lists the same key under several `show` conditions.
  const tabDiffCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of tabs) {
      const keys = new Set(tab.fields.filter((f) => f.kind !== 'group' && f.key in diff).map((f) => f.key));
      counts[tab.id] = keys.size + (tab.id === 'general' && groupsDirty ? 1 : 0);
    }
    return counts;
  }, [diff, tabs, groupsDirty]);

  const tabErrorCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(fieldErrors)) {
      const id = tabForField(tabs, key);
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [fieldErrors, tabs]);

  const diffCount = Object.keys(diff).length + (groupsDirty ? 1 : 0);

  // Re-validate live once the operator has seen errors, so fixing a field
  // clears its message without another Save click.
  useEffect(() => {
    setFieldErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = validateDraft(tabs, draft, t);
      // Keep backend messages for keys the client cannot judge.
      for (const [k, msg] of Object.entries(prev)) {
        if (!(k in next) && k in diff) next[k] = msg;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const jumpToFirstError = (errors: FieldErrors) => {
    const first = Object.keys(errors)[0];
    const id = first ? tabForField(tabs, first) : undefined;
    if (id) setActiveTab(id);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ closeAfter }: { closeAfter: boolean }) => {
      if (Object.keys(diff).length > 0) await patchMonitor(monitor.id, diff);
      if (groupsDirty && groupsDraft) {
        const want = new Set(groupsDraft);
        const have = new Set(membership.baseline);
        for (const id of want) if (!have.has(id)) await attachMonitorToGroup(id, monitor.id);
        for (const id of have) if (!want.has(id)) await detachMonitorFromGroup(membership.rowIds[id]);
      }
      return closeAfter;
    },
    onSuccess: (closeAfter) => {
      setSaveError(null);
      setFieldErrors({});
      // Promote the just-saved draft into the new baseline so the diff
      // counter zeroes immediately, without waiting on the parent refetch.
      setBaseline({ ...draft });
      setGroupsDraft(null);
      qc.invalidateQueries({ queryKey: ['monitor', monitor.id] });
      qc.invalidateQueries({ queryKey: ['monitors'] });
      qc.invalidateQueries({ queryKey: ['groups-monitors'] });
      toast.success(t('Monitor saved.'));
      if (closeAfter) onClose();
    },
    onError: (e: unknown) => {
      const fromApi = e instanceof ApiClientError ? fieldErrorsFromDetails(e.details) : {};
      if (Object.keys(fromApi).length > 0) {
        setFieldErrors(fromApi);
        jumpToFirstError(fromApi);
      }
      setSaveError(e instanceof Error ? e.message : String(e));
      toast.apiError(e);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMonitor(monitor.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      toast.success(t('Monitor "{{name}}" deleted.', { name: monitor.name }));
      (onDeleted ?? onClose)();
    },
    onError: toast.apiError,
  });

  const save = (closeAfter: boolean) => {
    const errors = validateDraft(tabs, draft, t);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaveError(t('Fix the highlighted fields first.'));
      jumpToFirstError(errors);
      return;
    }
    setSaveError(null);
    saveMutation.mutate({ closeAfter });
  };

  const handleClose = () => {
    if (diffCount > 0) {
      if (!confirm(t('Discard {{count}} unsaved change?', { count: diffCount }))) {
        return;
      }
    }
    onClose();
  };

  const handleDelete = () => {
    if (!confirm(t('Delete monitor "{{name}}"? Its events stay on disk until a filter removes them.', { name: monitor.name }))) {
      return;
    }
    deleteMutation.mutate();
  };

  const handleReset = () => {
    setDraft({ ...baseline });
    setGroupsDraft(null);
    setFieldErrors({});
    setSaveError(null);
  };

  const updateField = (key: string, value: FieldValue) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const activeTabDef = tabs.find((td) => td.id === activeTab) ?? tabs[0];
  const busy = saveMutation.isPending || deleteMutation.isPending;
  const monitorId = String(monitor.id);

  const linkClass = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border-subtle text-xs text-text-muted hover:text-text-primary hover:border-text-secondary/50 transition-colors';

  return (
    <div className="fixed inset-0 z-40 bg-void/95 backdrop-blur-md flex flex-col animate-in fade-in duration-150">
      {/* Header strip — title, quick links, delete, cancel */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-cyan/20 bg-surface/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded border border-cyan/40 bg-cyan/15 flex items-center justify-center flex-shrink-0">
            <span className="text-cyan font-mono text-[11px] font-semibold">M{monitor.id}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary truncate">{t('Edit · {{name}}', { name: monitor.name })}</h2>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {t('Configuration')}
            </div>
          </div>
        </div>
        <nav aria-label={t('Monitor shortcuts')} className="flex items-center gap-2">
          <Link to="/monitors/$monitorId" params={{ monitorId }} className={linkClass}>
            <MonitorPlay size={12} />
            {t('Watch')}
          </Link>
          <Link to="/cycle" search={{ monitor_id: monitor.id }} className={linkClass}>
            <RefreshCw size={12} />
            {t('Cycle')}
          </Link>
          <Link to="/monitors/$monitorId/zones" params={{ monitorId }} className={linkClass}>
            <PencilRuler size={12} />
            {t('Zones')}
          </Link>
          <RequirePerm feature="monitors" level="Edit">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-crimson/40 text-xs text-crimson hover:bg-crimson/10 transition-colors disabled:opacity-40"
            >
              {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {t('Delete')}
            </button>
          </RequirePerm>
          <button
            type="button"
            onClick={handleClose}
            className={linkClass}
          >
            <X size={12} />
            {t('Cancel')}
          </button>
        </nav>
      </div>

      {/* Body — two-pane: rail + form */}
      <div className="flex-1 flex min-h-0">
        {/* Left rail — tabs */}
        <nav
          aria-label={t('Edit sections')}
          className="w-56 flex-shrink-0 border-e border-border-subtle bg-surface/20 overflow-y-auto"
        >
          <ul className="py-2">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const count = tabDiffCount[tab.id] ?? 0;
              const errors = tabErrorCount[tab.id] ?? 0;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'group w-full flex items-center gap-2 px-4 py-2 text-start text-sm transition-all',
                      'border-s-2',
                      isActive
                        ? 'border-cyan bg-cyan/10 text-cyan'
                        : 'border-transparent text-text-secondary hover:bg-surface/60 hover:text-text-primary',
                    )}
                  >
                    <span className="flex-1">{tab.label}</span>
                    {errors > 0 && (
                      <span
                        className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-mono bg-crimson/20 text-crimson"
                        aria-label={t('{{count}} invalid field in {{tab}}', { count: errors, tab: tab.label })}
                      >
                        {errors}
                      </span>
                    )}
                    {count > 0 && (
                      <span
                        className={clsx(
                          'inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-mono',
                          isActive
                            ? 'bg-cyan/30 text-cyan'
                            : 'bg-cyan/20 text-cyan',
                        )}
                        aria-label={t('{{count}} pending change in {{tab}}', { count, tab: tab.label })}
                      >
                        {count}
                      </span>
                    )}
                    <ChevronRight
                      size={12}
                      className={clsx(
                        'transition-opacity rtl:-scale-x-100',
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Form pane */}
        <div className="flex-1 overflow-y-auto">
          <FormPane
            tab={activeTabDef}
            monitorId={monitor.id}
            draft={draft}
            baseline={baseline}
            errors={fieldErrors}
            onUpdate={updateField}
          />
          {activeTabDef.id === 'general' && (
            <div className="max-w-4xl mx-auto px-8 pb-8">
              <h4 className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan/80 pt-2 pb-1 mb-3 border-b border-cyan/15">
                {t('Groups')}
              </h4>
              <GroupsMembership value={groupsValue} onChange={setGroupsDraft} />
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer — diff count + actions */}
      <footer className="flex items-center justify-between px-6 py-3 border-t border-cyan/20 bg-surface/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {saveError ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-crimson">
              <AlertCircle size={12} />
              {saveError}
            </span>
          ) : diffCount > 0 ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse"
                aria-hidden
              />
              <span className="text-xs font-mono text-cyan tabular-nums">
                {t('{{count}} unsaved change', { count: diffCount })}
              </span>
            </>
          ) : (
            <span className="text-xs font-mono text-text-muted">{t('No pending changes')}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={diffCount === 0 || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-secondary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 size={11} />
            {t('Reset')}
          </button>
          <RequirePerm
            feature="monitors"
            level="Edit"
            fallback={<span className="text-xs text-text-muted">{t('Read-only: you lack Monitors edit permission.')}</span>}
          >
            <button
              type="button"
              onClick={() => save(false)}
              disabled={diffCount === 0 || busy}
              className={clsx(
                'inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded border-2 transition-all',
                diffCount > 0 && !busy
                  ? 'border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 shadow-[0_0_18px_rgba(0,212,255,0.25)]'
                  : 'border-border-subtle text-text-muted bg-surface/40',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {saveMutation.isPending
                ? <Loader2 size={11} className="animate-spin" />
                : <Save size={11} />}
              {saveMutation.isPending
                ? t('Saving…')
                : diffCount > 0 ? t('Save {{n}}', { n: diffCount }) : t('Save')}
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={diffCount === 0 || busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-cyan/40 text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('Save and close')}
            </button>
          </RequirePerm>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Form pane + field renderers                                             */
/* ------------------------------------------------------------------------ */

interface FormPaneProps {
  tab: TabDef;
  monitorId: number;
  draft: Record<string, FieldValue>;
  baseline: Record<string, FieldValue>;
  errors: FieldErrors;
  onUpdate: (key: string, value: FieldValue) => void;
}

function FormPane({ tab, monitorId, draft, baseline, errors, onUpdate }: FormPaneProps) {
  const fields = visibleFields(tab, draft);
  return (
    <div className="max-w-4xl mx-auto px-8 py-6">
      <header className="mb-6 pb-4 border-b border-border-subtle/50">
        <h3 className="text-lg font-semibold text-text-primary">{tab.label}</h3>
        {tab.description && (
          <p className="text-xs text-text-muted mt-1">{tab.description}</p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {fields.map((f, idx) => {
          if (f.kind === 'group') {
            return (
              <h4
                key={`${tab.id}-${f.key}`}
                className="col-span-2 text-[10px] font-mono uppercase tracking-[0.22em] text-cyan/80 pt-2 pb-1 border-b border-cyan/15"
              >
                {f.label}
              </h4>
            );
          }
          return (
            <FieldRow
              key={`${f.key}-${idx}`}
              field={f}
              monitorId={monitorId}
              draft={draft}
              value={draft[f.key]}
              isDirty={!sameValue(draft[f.key], baseline[f.key])}
              error={errors[f.key]}
              onChange={(v) => onUpdate(f.key, v)}
              onUpdate={onUpdate}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FieldRowProps {
  field: FieldDef;
  monitorId: number;
  draft: Record<string, FieldValue>;
  value: FieldValue;
  isDirty: boolean;
  error?: string;
  onChange: (v: FieldValue) => void;
  onUpdate: (key: string, value: FieldValue) => void;
}

function FieldRow({ field, monitorId, draft, value, isDirty, error, onChange, onUpdate }: FieldRowProps) {
  const { t } = useTranslation();
  const span = field.span === 2 ? 'col-span-2' : 'col-span-2 md:col-span-1';

  return (
    <div className={span}>
      <label className="flex items-center gap-2 mb-1.5">
        <span
          className={clsx(
            'text-[10px] font-mono uppercase tracking-[0.18em]',
            error ? 'text-crimson' : isDirty ? 'text-cyan' : 'text-text-muted',
          )}
        >
          {field.label}
          {field.required && <span aria-hidden className="text-crimson ms-0.5">*</span>}
        </span>
        {isDirty && (
          <span
            className="w-1 h-1 rounded-full bg-cyan animate-pulse"
            aria-label={t('Changed')}
          />
        )}
        {field.link && (
          <Link
            to={field.link.to}
            className="ms-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-cyan hover:underline"
          >
            {field.link.label}
            <ExternalLink size={10} />
          </Link>
        )}
      </label>

      <FieldInput
        field={field}
        monitorId={monitorId}
        draft={draft}
        value={value}
        invalid={!!error}
        onChange={onChange}
        onUpdate={onUpdate}
      />

      {error ? (
        <p role="alert" className="text-[10px] text-crimson mt-1 leading-relaxed">{error}</p>
      ) : field.help ? (
        <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}

function FieldInput({
  field,
  monitorId,
  draft,
  value,
  invalid,
  onChange,
  onUpdate,
}: {
  field: FieldDef;
  monitorId: number;
  draft: Record<string, FieldValue>;
  value: FieldValue;
  invalid: boolean;
  onChange: (v: FieldValue) => void;
  onUpdate: (key: string, value: FieldValue) => void;
}) {
  const { t } = useTranslation();
  const baseInput = clsx(
    'w-full px-2.5 py-1.5 text-sm bg-surface border rounded text-text-primary placeholder:text-text-dim focus:outline-none focus:ring-1 transition-colors',
    invalid
      ? 'border-crimson/60 focus:border-crimson focus:ring-crimson/20'
      : 'border-border-subtle focus:border-cyan/50 focus:ring-cyan/20',
  );

  if (field.kind === 'textarea') {
    return (
      <textarea
        rows={3}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        aria-invalid={invalid || undefined}
        className={clsx(baseInput, 'font-mono text-xs leading-relaxed resize-y')}
      />
    );
  }

  if (field.kind === 'number') {
    return (
      <input
        type="number"
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        min={field.min}
        max={field.max}
        step={field.integer ? 1 : 'any'}
        placeholder={field.placeholder}
        aria-invalid={invalid || undefined}
        className={clsx(baseInput, 'font-mono tabular-nums')}
      />
    );
  }

  if (field.kind === 'toggle') {
    // Backend stores booleans as 0/1 ints.
    const on = Number(value) === 1;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? 0 : 1)}
        className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded border-2 text-xs font-medium tracking-wide transition-all',
          on
            ? 'border-cyan/60 bg-cyan/15 text-cyan'
            : 'border-border-subtle bg-surface text-text-muted hover:border-text-secondary/50',
        )}
      >
        <span
          className={clsx(
            'w-6 h-3 rounded-full p-0.5 flex items-center transition-colors',
            on ? 'bg-cyan/40 justify-end' : 'bg-text-muted/30 justify-start',
          )}
        >
          <span className="w-2 h-2 rounded-full bg-white" />
        </span>
        {on ? t('Enabled') : t('Disabled')}
      </button>
    );
  }

  if (field.kind === 'select' && field.options) {
    // Coerce back to number when the option values are numeric — keeps the
    // PATCH body's types matching the backend schema (e.g. label_size:int,
    // return_location:int) instead of stringifying them.
    const optionsAreNumeric = field.options.every((o) => typeof o.value === 'number');
    const current = value == null ? '' : String(value);
    const known = field.options.some((o) => String(o.value) === current);
    return (
      <select
        value={current}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') { onChange(null); return; }
          onChange(optionsAreNumeric ? Number(raw) : raw);
        }}
        aria-invalid={invalid || undefined}
        className={clsx(baseInput, 'cursor-pointer')}
      >
        {(field.nullOption || (!known && current === '')) && (
          <option value="">{field.nullOption ?? t('Not set')}</option>
        )}
        {field.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
        {/* A stored value outside the legacy list stays selectable instead of snapping to the first option. */}
        {!known && current !== '' && <option value={current}>{current}</option>}
      </select>
    );
  }

  if (field.kind === 'color') {
    return <ColorInput value={value} onChange={onChange} className={baseInput} randomizable={field.key === 'web_colour'} />;
  }

  if (field.kind === 'resolution') {
    return (
      <ResolutionInput
        width={draft.width}
        height={draft.height}
        invalid={invalid}
        onChange={(w, h) => { onUpdate('width', w); onUpdate('height', h); }}
        className={baseInput}
      />
    );
  }

  if (field.kind === 'control-select') {
    return <ControlSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'storage-select') {
    return <StorageSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'server-select') {
    return <ServerSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'manufacturer-select') {
    return <ManufacturerSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'model-select') {
    const mid = draft.manufacturer_id == null ? null : Number(draft.manufacturer_id);
    return <ModelSelect manufacturerId={mid} value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'return-location-select') {
    return <ReturnLocationSelect monitorId={monitorId} value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'linked-monitors') {
    return <LinkedMonitorsSelect selfId={monitorId} value={value} onChange={onChange} className={baseInput} />;
  }

  if (field.kind === 'password') {
    return <PasswordInput value={value} onChange={onChange} className={baseInput} />;
  }

  // text
  return (
    <input
      type="text"
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      aria-invalid={invalid || undefined}
      className={clsx(baseInput, 'font-mono')}
    />
  );
}

/* ------------------------------------------------------------------------ */
/*  Specialised inputs                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Password input with a visibility toggle. Mirrors the legacy ONVIF/source
 * password fields which ship with an eye icon — operators expect to be able
 * to verify what they're typing against the camera UI.
 */
function PasswordInput({
  value,
  onChange,
  className,
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        className={clsx(className, 'font-mono pe-9')}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('Hide password') : t('Show password')}
        className="absolute end-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

/**
 * Colour picker + editable text. ZoneMinder stores CSS colour strings, so
 * legacy rows can hold names (`red`); the picker only understands hex, so a
 * non-hex value shows as black in the swatch until the operator picks one.
 */
function ColorInput({
  value,
  onChange,
  className,
  randomizable,
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  className: string;
  randomizable?: boolean;
}) {
  const { t } = useTranslation();
  const text = value == null ? '' : String(value);
  const hex = HEX_COLOUR.test(text) ? text : '#000000';
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('Pick colour')}
        className="h-8 w-10 rounded border border-border-subtle bg-surface cursor-pointer p-0.5"
      />
      <input
        type="text"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#00d4ff"
        className={clsx(className, 'font-mono flex-1')}
      />
      {randomizable && (
        <button
          type="button"
          onClick={() => onChange(randomHexColour())}
          aria-label={t('Random colour')}
          title={t('Random colour')}
          className="p-1.5 rounded border border-border-subtle text-text-muted hover:text-text-primary"
        >
          <Shuffle size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Width × height with the legacy resolution preset list and a "preserve
 * aspect" lock: with the lock on, editing one side recomputes the other
 * from the ratio the pair had when the lock was switched on.
 */
function ResolutionInput({
  width,
  height,
  invalid,
  onChange,
  className,
}: {
  width: FieldValue;
  height: FieldValue;
  invalid: boolean;
  onChange: (w: FieldValue, h: FieldValue) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const [ratio, setRatio] = useState<number | null>(null);
  const w = width == null ? '' : String(width);
  const h = height == null ? '' : String(height);
  const presetValue = w && h ? `${w}x${h}` : '';
  const inList = RESOLUTION_PRESETS.some((p) => `${p.width}x${p.height}` === presetValue);

  const setWidth = (raw: string) => {
    const nw = raw === '' ? null : Number(raw);
    if (ratio && nw) onChange(nw, Math.max(1, Math.round(nw / ratio)));
    else onChange(nw, height);
  };
  const setHeight = (raw: string) => {
    const nh = raw === '' ? null : Number(raw);
    if (ratio && nh) onChange(Math.max(1, Math.round(nh * ratio)), nh);
    else onChange(width, nh);
  };
  const toggleLock = () => {
    const nw = Number(width), nh = Number(height);
    setRatio(ratio ? null : nw > 0 && nh > 0 ? nw / nh : null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        step={1}
        value={w}
        onChange={(e) => setWidth(e.target.value)}
        aria-label={t('Width (px)')}
        aria-invalid={invalid || undefined}
        className={clsx(className, 'font-mono tabular-nums w-24 flex-none')}
      />
      <span className="text-text-muted">×</span>
      <input
        type="number"
        min={1}
        step={1}
        value={h}
        onChange={(e) => setHeight(e.target.value)}
        aria-label={t('Height (px)')}
        aria-invalid={invalid || undefined}
        className={clsx(className, 'font-mono tabular-nums w-24 flex-none')}
      />
      <select
        value={inList ? presetValue : ''}
        onChange={(e) => {
          const [pw, ph] = e.target.value.split('x').map(Number);
          if (pw && ph) { setRatio(null); onChange(pw, ph); }
        }}
        aria-label={t('Resolution preset')}
        className={clsx(className, 'cursor-pointer flex-1 min-w-[10rem]')}
      >
        <option value="">{t('Custom')}</option>
        {RESOLUTION_PRESETS.map((p) => (
          <option key={p.label} value={`${p.width}x${p.height}`}>{p.label}</option>
        ))}
      </select>
      <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
        <input type="checkbox" className="accent-cyan" checked={ratio != null} onChange={toggleLock} />
        {t('Preserve aspect ratio')}
      </label>
    </div>
  );
}

/**
 * Control-type dropdown — sources options from /api/v3/controls. We
 * surface the friendly name in the option label, but the value is the
 * numeric control_id so PATCH bodies carry the right FK type.
 *
 * While the list is loading we still render the select but mark it as
 * disabled so the operator sees something rather than a blank gap. If the
 * fetch fails we surface a tiny error line under the field — the editor's
 * own save button stays enabled (the user might be backing out of an edit).
 */
function ControlSelect({
  value,
  onChange,
  className,
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['controls', { page_size: 200 }],
    queryFn: () => listControls({ page: 1, page_size: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const controls = data?.items ?? [];

  return (
    <div>
      <select
        value={value == null ? '0' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' || raw === '0' ? 0 : Number(raw));
        }}
        disabled={isLoading}
        className={clsx(className, 'cursor-pointer')}
      >
        <option value="0">{t('None')}</option>
        {controls.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.protocol ? ` (${c.protocol})` : ''}
          </option>
        ))}
      </select>
      {isError && (
        <p className="text-[10px] text-crimson mt-1">
          {t('Could not load control list — save will still work if you don’t change this field.')}
        </p>
      )}
    </div>
  );
}
