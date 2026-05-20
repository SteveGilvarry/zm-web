import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  X, Save, Undo2, Loader2, ChevronRight, AlertCircle,
} from 'lucide-react';
import { patchMonitor } from '@/api/monitors-crud';
import type { Monitor } from '@/types';
import { TABS, type FieldDef, type TabDef } from './fields';

interface MonitorEditorProps {
  monitor: Monitor;
  onClose: () => void;
}

type FieldValue = string | number | null;

/**
 * Full monitor editor — the dashboard's replacement for the legacy ZM
 * monitor-edit page. The legacy UI piled ~80 fields into 11 tabs with no
 * change-tracking, no inline help and a 1990s submit-or-cancel flow. This
 * editor keeps the tab layout (operators are trained on it) but adds:
 *
 *  - explicit diff tracking — every changed field gets a cyan marker dot,
 *    the footer shows a count, and Save only PATCHes the keys that changed
 *  - inline help text under fields where the legacy UI hid it behind a (?)
 *  - field groupings (Run mode / Stream / Image …) so the dense Source tab
 *    reads as three logical clusters rather than one wall of inputs
 *  - confirm-discard if the user closes with unsaved changes
 *
 * Implemented as an in-page overlay rather than a separate route so the
 * back button returns the operator to the live detail view instantly.
 */
export function MonitorEditor({ monitor, onClose }: MonitorEditorProps) {
  const qc = useQueryClient();
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

  // Reset baseline + draft only when the underlying monitor identity flips
  // (rare — the route would have to navigate). Mid-edit refetches of the
  // *same* monitor leave the user's in-progress draft untouched.
  useEffect(() => {
    const fresh = extractEditableFields(monitor);
    setBaseline(fresh);
    setDraft(fresh);
  }, [monitor.id]);

  // Diff = keys whose draft value differs from baseline.
  const diff = useMemo(() => {
    const out: Record<string, FieldValue> = {};
    for (const [k, v] of Object.entries(draft)) {
      const orig = baseline[k];
      if (!sameValue(v, orig)) out[k] = v;
    }
    return out;
  }, [draft, baseline]);

  // Per-tab diff counts so the rail badges stay live.
  const tabDiffCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of TABS) {
      counts[tab.id] = tab.fields.filter(
        (f) => f.kind !== 'group' && f.key in diff,
      ).length;
    }
    return counts;
  }, [diff]);

  const saveMutation = useMutation({
    mutationFn: () => patchMonitor(monitor.id, diff),
    onSuccess: () => {
      setSaveError(null);
      // Promote the just-saved draft into the new baseline so the diff
      // counter zeroes immediately, without waiting on the parent refetch.
      setBaseline({ ...draft });
      qc.invalidateQueries({ queryKey: ['monitor', monitor.id] });
      qc.invalidateQueries({ queryKey: ['monitors'] });
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const handleClose = () => {
    if (Object.keys(diff).length > 0) {
      if (!confirm(`Discard ${Object.keys(diff).length} unsaved change${Object.keys(diff).length === 1 ? '' : 's'}?`)) {
        return;
      }
    }
    onClose();
  };

  const handleReset = () => {
    setDraft({ ...baseline });
    setSaveError(null);
  };

  const updateField = (key: string, value: FieldValue) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const diffCount = Object.keys(diff).length;

  return (
    <div className="fixed inset-0 z-40 bg-void/95 backdrop-blur-md flex flex-col animate-in fade-in duration-150">
      {/* Header strip — title + close */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-cyan/20 bg-surface/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border border-cyan/40 bg-cyan/15 flex items-center justify-center">
            <span className="text-cyan font-mono text-[11px] font-semibold">M{monitor.id}</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Edit · {monitor.name}</h2>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              Configuration
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          aria-label="Close editor"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-secondary/50 transition-colors text-xs"
        >
          <X size={12} />
          Close
        </button>
      </div>

      {/* Body — two-pane: rail + form */}
      <div className="flex-1 flex min-h-0">
        {/* Left rail — tabs */}
        <nav
          aria-label="Edit sections"
          className="w-56 flex-shrink-0 border-r border-border-subtle bg-surface/20 overflow-y-auto"
        >
          <ul className="py-2">
            {TABS.map((t) => {
              const isActive = t.id === activeTab;
              const count = tabDiffCount[t.id] ?? 0;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveTab(t.id)}
                    className={clsx(
                      'group w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-all',
                      'border-l-2',
                      isActive
                        ? 'border-cyan bg-cyan/10 text-cyan'
                        : 'border-transparent text-text-secondary hover:bg-surface/60 hover:text-text-primary',
                    )}
                  >
                    <span className="flex-1">{t.label}</span>
                    {count > 0 && (
                      <span
                        className={clsx(
                          'inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-mono',
                          isActive
                            ? 'bg-cyan/30 text-cyan'
                            : 'bg-cyan/20 text-cyan',
                        )}
                        aria-label={`${count} pending changes in ${t.label}`}
                      >
                        {count}
                      </span>
                    )}
                    <ChevronRight
                      size={12}
                      className={clsx(
                        'transition-opacity',
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
            tab={tab}
            draft={draft}
            baseline={baseline}
            onUpdate={updateField}
          />
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
                {diffCount} unsaved change{diffCount === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span className="text-xs font-mono text-text-muted">No pending changes</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={diffCount === 0 || saveMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-secondary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 size={11} />
            Reset
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={diffCount === 0 || saveMutation.isPending}
            className={clsx(
              'inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded border-2 transition-all',
              diffCount > 0 && !saveMutation.isPending
                ? 'border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 shadow-[0_0_18px_rgba(0,212,255,0.25)]'
                : 'border-border-subtle text-text-muted bg-surface/40',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {saveMutation.isPending
              ? <Loader2 size={11} className="animate-spin" />
              : <Save size={11} />}
            {saveMutation.isPending ? 'Saving…' : `Save${diffCount > 0 ? ` ${diffCount}` : ''}`}
          </button>
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
  draft: Record<string, FieldValue>;
  baseline: Record<string, FieldValue>;
  onUpdate: (key: string, value: FieldValue) => void;
}

function FormPane({ tab, draft, baseline, onUpdate }: FormPaneProps) {
  return (
    <div className="max-w-4xl mx-auto px-8 py-6">
      <header className="mb-6 pb-4 border-b border-border-subtle/50">
        <h3 className="text-lg font-semibold text-text-primary">{tab.label}</h3>
        {tab.description && (
          <p className="text-xs text-text-muted mt-1">{tab.description}</p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {tab.fields.map((f, idx) => {
          if (f.kind === 'group') {
            return (
              <h4
                key={`${tab.id}-${idx}`}
                className="col-span-2 text-[10px] font-mono uppercase tracking-[0.22em] text-cyan/80 pt-2 pb-1 border-b border-cyan/15"
              >
                {f.label}
              </h4>
            );
          }
          return (
            <FieldRow
              key={f.key}
              field={f}
              value={draft[f.key]}
              isDirty={!sameValue(draft[f.key], baseline[f.key])}
              onChange={(v) => onUpdate(f.key, v)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FieldRowProps {
  field: FieldDef;
  value: FieldValue;
  isDirty: boolean;
  onChange: (v: FieldValue) => void;
}

function FieldRow({ field, value, isDirty, onChange }: FieldRowProps) {
  const span = field.span === 2 ? 'col-span-2' : 'col-span-2 md:col-span-1';

  return (
    <div className={span}>
      <label className="flex items-center gap-2 mb-1.5">
        <span
          className={clsx(
            'text-[10px] font-mono uppercase tracking-[0.18em]',
            isDirty ? 'text-cyan' : 'text-text-muted',
          )}
        >
          {field.label}
        </span>
        {isDirty && (
          <span
            className="w-1 h-1 rounded-full bg-cyan animate-pulse"
            aria-label="Changed"
          />
        )}
      </label>

      <FieldInput field={field} value={value} onChange={onChange} />

      {field.help && (
        <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
          {field.help}
        </p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const baseInput =
    'w-full px-2.5 py-1.5 text-sm bg-surface border border-border-subtle rounded text-text-primary placeholder:text-text-dim focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20 transition-colors';

  if (field.kind === 'textarea') {
    return (
      <textarea
        rows={3}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
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
        {on ? 'Enabled' : 'Disabled'}
      </button>
    );
  }

  if (field.kind === 'select' && field.options) {
    return (
      <select
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(baseInput, 'cursor-pointer')}
      >
        {field.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    );
  }

  // text
  return (
    <input
      type="text"
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(baseInput, 'font-mono')}
    />
  );
}

/* ------------------------------------------------------------------------ */
/*  Helpers                                                                 */
/* ------------------------------------------------------------------------ */

/** Snapshot every editable field from a Monitor record into draft shape. */
function extractEditableFields(monitor: Monitor): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  const m = monitor as unknown as Record<string, unknown>;
  for (const tab of TABS) {
    for (const f of tab.fields) {
      if (f.kind === 'group') continue;
      const raw = m[f.key];
      if (raw == null) out[f.key] = null;
      else if (typeof raw === 'object') out[f.key] = String(raw);
      else out[f.key] = raw as FieldValue;
    }
  }
  return out;
}

function sameValue(a: FieldValue, b: FieldValue): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Loose-eq on number↔string so '0' === 0.
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}
