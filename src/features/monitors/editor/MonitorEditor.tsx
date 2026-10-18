import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  X, Save, Undo2, Loader2, ChevronRight, AlertCircle, Trash2,
  MonitorPlay, RefreshCw, PencilRuler, ExternalLink, ListOrdered, Rss, Plus,
} from 'lucide-react';
import { buttonClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import type { Monitor } from '@/types';
import {
  useMonitorTabs, visibleFields, isFieldLocked,
  type FieldDef, type TabDef, type FieldValue, type FieldErrors,
} from './fields';
import { GroupsMembership } from './RelationSelects';
import { FieldInput } from './FieldInput';
import { sameValue, isUnsetSecret, storedOnly } from './editorState';
import { useMonitorEditor, type MonitorEditorSeed } from './useMonitorEditor';
import { PresetDialog } from '../presets/PresetDialog';
import { DiscoveryDialog } from '../discovery/DiscoveryDialog';

interface MonitorEditorProps {
  /** The monitor to edit. Omit it and pass `seed` to add one (legacy Add / Clone). */
  monitor?: Monitor;
  seed?: MonitorEditorSeed;
  /** After a create, with the new row. */
  onCreated?: (monitor: Monitor) => void;
  onClose: () => void;
  /** Legacy `?tab=`: the tab to open on, and where to report a tab change. */
  initialTab?: string;
  onTabChange?: (tab: string) => void;
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
 *  - explicit diff tracking — every changed field gets a accent marker dot,
 *    the footer shows a count, and Save only PATCHes the keys that changed
 *  - type-dependent Source widgets, as the legacy form swaps on `type`
 *  - client validation plus backend 422 details mapped onto the fields
 *  - group membership edited in place (attach / detach on save)
 *  - confirm-discard if the user closes with unsaved changes
 *
 * Implemented as an in-page overlay rather than a separate route so the
 * back button returns the operator to the live detail view instantly.
 * State and verbs live in {@link useMonitorEditor}, shared with the
 * classic skin's page.
 *
 * Keyed on `monitor.id`: draft + baseline reset only when the underlying
 * monitor identity flips (rare — the route would have to navigate). Mid-edit
 * refetches of the *same* monitor leave the in-progress draft untouched.
 */
export function MonitorEditor(props: MonitorEditorProps) {
  return <MonitorEditorBody key={props.monitor?.id ?? 'new'} {...props} />;
}

function MonitorEditorBody({ monitor, seed, onCreated, onClose, onDeleted, initialTab, onTabChange }: MonitorEditorProps) {
  const { t } = useTranslation();
  const tabs = useMonitorTabs();
  const ed = useMonitorEditor({ tabs, monitor, seed, onClose, onDeleted, onCreated, initialTab });
  const { activeTabDef, diffCount, busy, isNew } = ed;
  const monitorId = String(monitor?.id ?? '');

  const linkClass = buttonClasses('secondary', 'sm');
  // Legacy Presets / ONVIF probe: both write into this draft; nothing saves until Save.
  const [sourceDialog, setSourceDialog] = useState<'preset' | 'onvif' | null>(null);
  const sourceTools = (
    <RequirePerm feature="monitors" level="Edit">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setSourceDialog('preset')} className={linkClass}>
          <ListOrdered size={12} />
          {t('Presets')}
        </button>
        <button type="button" onClick={() => setSourceDialog('onvif')} className={linkClass}>
          <Rss size={12} />
          {t('ONVIF probe')}
        </button>
      </div>
    </RequirePerm>
  );

  return (
    <div
      data-testid="monitor-editor"
      role="dialog"
      aria-modal="true"
      aria-label={monitor ? t('Edit · {{name}}', { name: monitor.name }) : t('Add monitor')}
      className="fixed inset-0 z-40 bg-bg flex flex-col animate-in fade-in duration-150"
    >
      {/* Header strip — title, quick links, delete, cancel */}
      <div className="flex items-center justify-between gap-4 px-5 py-2.5 border-b border-border bg-surface">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded border border-border-subtle bg-surface-2 flex items-center justify-center flex-shrink-0">
            {monitor
              ? <span className="text-fg-muted font-mono tabular-nums text-xs font-semibold">M{monitor.id}</span>
              : <Plus size={14} className="text-fg-muted" aria-hidden />}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg truncate">
              {monitor ? t('Edit · {{name}}', { name: monitor.name }) : t('Add monitor')}
            </h2>
            <div className="text-label text-fg-dim">
              {ed.clonedFrom
                ? t('Configuration cloned from Monitor: {{name}}', { name: ed.clonedFrom })
                : isNew ? t('Nothing is created until you save.') : t('Configuration')}
            </div>
          </div>
        </div>
        <nav aria-label={t('Monitor shortcuts')} className="flex items-center gap-2">
          {monitor && (<>
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
              onClick={ed.requestDelete}
              disabled={busy}
              className={clsx(buttonClasses('secondary', 'sm'), 'text-danger hover:text-danger hover:border-danger/50')}
            >
              {ed.deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {t('Delete')}
            </button>
          </RequirePerm>
          </>)}
          <button
            type="button"
            onClick={ed.requestClose}
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
          className="w-56 flex-shrink-0 border-e border-border-subtle bg-surface overflow-y-auto"
        >
          <ul className="py-2">
            {ed.tabs.map((tab) => {
              const isActive = tab.id === activeTabDef.id;
              const count = ed.tabDiffCount[tab.id] ?? 0;
              const errors = ed.tabErrorCount[tab.id] ?? 0;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => { ed.setActiveTab(tab.id); onTabChange?.(tab.id); }}
                    className={clsx(
                      'group w-full flex items-center gap-2 px-4 py-1.5 text-start text-sm transition-colors',
                      'border-s-2',
                      isActive
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    <span className="flex-1">{tab.label}</span>
                    {errors > 0 && (
                      <span
                        className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded text-xs font-mono tabular-nums bg-danger/12 text-danger"
                        aria-label={t('{{count}} invalid field in {{tab}}', { count: errors, tab: tab.label })}
                      >
                        {errors}
                      </span>
                    )}
                    {count > 0 && (
                      <span
                        className={clsx(
                          'inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded text-xs font-mono tabular-nums',
                          'bg-accent/12 text-accent',
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
            monitorId={monitor?.id ?? 0}
            draft={ed.draft}
            baseline={ed.baseline}
            errors={ed.fieldErrors}
            onUpdate={ed.updateField}
            tools={activeTabDef.id === 'source' ? sourceTools : undefined}
          />
          {activeTabDef.id === 'general' && (
            <div className="max-w-4xl mx-auto px-6 pb-6">
              <h4 className="text-label font-medium text-fg-muted pt-2 pb-1 mb-3 border-b border-border-subtle">
                {t('Groups')}
              </h4>
              <GroupsMembership value={ed.groupsValue} onChange={ed.setGroups} />
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer — diff count + actions */}
      <footer className="flex items-center justify-between px-5 py-2.5 border-t border-border bg-surface">
        <div className="flex items-center gap-3">
          {ed.saveError ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-danger">
              <AlertCircle size={12} />
              {ed.saveError}
            </span>
          ) : diffCount > 0 ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
              <span className="text-xs text-accent">
                {t('{{count}} unsaved change', { count: diffCount })}
              </span>
            </>
          ) : (
            <span className="text-xs text-fg-dim">{t('No pending changes')}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={ed.reset}
            disabled={diffCount === 0 || busy}
            className={buttonClasses('secondary', 'sm')}
          >
            <Undo2 size={11} />
            {t('Reset')}
          </button>
          <RequirePerm
            feature="monitors"
            level="Edit"
            fallback={<span className="text-xs text-fg-dim">{t('Read-only: you lack Monitors edit permission.')}</span>}
          >
            {isNew ? (
              <button
                type="button"
                onClick={() => ed.save(true)}
                disabled={busy}
                className={buttonClasses('primary', 'sm')}
              >
                {ed.saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                {ed.saving ? t('Saving…') : t('Create monitor')}
              </button>
            ) : (<>
            <button
              type="button"
              onClick={() => ed.save(false)}
              disabled={diffCount === 0 || busy}
              className={buttonClasses('primary', 'sm')}
            >
              {ed.saving
                ? <Loader2 size={11} className="animate-spin" />
                : <Save size={11} />}
              {ed.saving
                ? t('Saving…')
                : diffCount > 0 ? t('Save {{n}}', { n: diffCount }) : t('Save')}
            </button>
            <button
              type="button"
              onClick={() => ed.save(true)}
              disabled={diffCount === 0 || busy}
              className={buttonClasses('secondary', 'sm')}
            >
              {t('Save and close')}
            </button>
            </>)}
          </RequirePerm>
        </div>
      </footer>

      {sourceDialog === 'preset' && (
        <PresetDialog onApply={ed.applyValues} onClose={() => setSourceDialog(null)} />
      )}
      <DiscoveryDialog open={sourceDialog === 'onvif'} onApply={ed.applyValues} onClose={() => setSourceDialog(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Form pane + field rows                                                  */
/* ------------------------------------------------------------------------ */

interface FormPaneProps {
  tab: TabDef;
  monitorId: number;
  draft: Record<string, FieldValue>;
  baseline: Record<string, FieldValue>;
  errors: FieldErrors;
  onUpdate: (key: string, value: FieldValue) => void;
  /** Tab-level actions shown beside the heading (Source: Presets, ONVIF probe). */
  tools?: ReactNode;
}

function FormPane({ tab, monitorId, draft, baseline, errors, onUpdate, tools }: FormPaneProps) {
  const fields = visibleFields(tab, draft);
  return (
    <div className="max-w-4xl mx-auto px-6 py-5">
      <header className="mb-5 pb-3 border-b border-border-subtle flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-fg">{tab.label}</h3>
          {tab.description && (
            <p className="text-xs text-fg-dim mt-1">{tab.description}</p>
          )}
        </div>
        {tools}
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {fields.map((f, idx) => {
          if (f.kind === 'group') {
            return (
              <h4
                key={`${tab.id}-${f.key}`}
                className="col-span-2 text-label font-medium text-fg-muted pt-2 pb-1 border-b border-border-subtle"
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
              stored={baseline[f.key]}
              isDirty={!isUnsetSecret(f.key, draft[f.key]) && !sameValue(draft[f.key], baseline[f.key])}
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
  /** The value as loaded, for options offered only to a stored value. */
  stored: FieldValue;
  isDirty: boolean;
  error?: string;
  onChange: (v: FieldValue) => void;
  onUpdate: (key: string, value: FieldValue) => void;
}

function FieldRow({ field, monitorId, draft, value, stored, isDirty, error, onChange, onUpdate }: FieldRowProps) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const locked = isFieldLocked(field, can);
  const span = field.span === 2 ? 'col-span-2' : 'col-span-2 md:col-span-1';

  return (
    <div className={span}>
      <label className="flex items-center gap-2 mb-1">
        <span
          className={clsx(
            'text-label',
            error ? 'text-danger' : isDirty ? 'text-accent' : 'text-fg-dim',
          )}
        >
          {field.label}
          {field.required && <span aria-hidden className="text-danger ms-0.5">*</span>}
        </span>
        {isDirty && (
          <span
            className="w-1 h-1 rounded-full bg-accent"
            aria-label={t('Changed')}
          />
        )}
        {field.link && (
          <Link
            to={field.link.to}
            className="ms-auto inline-flex items-center gap-1 text-xs text-accent hover:underline"
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
        stored={stored}
        invalid={!!error}
        locked={locked}
        onChange={onChange}
        onUpdate={onUpdate}
      />

      {storedOnly(field, stored) && field.storedOnlyWarning && (
        <p className="text-xs text-warn mt-1 leading-relaxed">{field.storedOnlyWarning}</p>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger mt-1 leading-relaxed">{error}</p>
      ) : field.help ? (
        <p className="text-xs text-fg-dim mt-1 leading-relaxed">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}
