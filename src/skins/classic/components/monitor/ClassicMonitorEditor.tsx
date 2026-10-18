import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ListOrdered, Rss } from 'lucide-react';
import { listGroups } from '@/api/groups';
import { Modal } from '@/components/common/Modal';
import { usePerms } from '@/features/auth/usePerms';
import { useClassicMonitorTabs, estimatedRamUse } from '@/features/monitors/editor/classicFields';
import { isFieldLocked, visibleFields, type FieldDef, type FieldValue } from '@/features/monitors/editor/fields';
import { FieldInput } from '@/features/monitors/editor/FieldInput';
import { storedOnly } from '@/features/monitors/editor/editorState';
import { useMonitorEditor, type MonitorEditorSeed, type MonitorEditorState } from '@/features/monitors/editor/useMonitorEditor';
import { PresetDialog } from '@/features/monitors/presets/PresetDialog';
import { DiscoveryDialog } from '@/features/monitors/discovery/DiscoveryDialog';
import type { Monitor } from '@/types';
import { ClassicButton, ClassicIconButton } from '../Button';
import { ClassicHeader, ClassicPage } from '../Page';

interface ClassicMonitorEditorProps {
  /** The monitor to edit; omit with `seed` for Add / Clone. */
  monitor?: Monitor;
  seed?: MonitorEditorSeed;
  onClose: () => void;
  onCreated?: (monitor: Monitor) => void;
  /** Legacy `?tab=`: the tab to open on, and where to report a tab change. */
  initialTab?: string;
  onTabChange?: (tab: string) => void;
}

/** Legacy Bootstrap-flat field recipe. */
const classicInput = (invalid: boolean) =>
  clsx(
    'px-2 py-0.5 text-sm bg-white border rounded-sm text-zinc-900 placeholder:text-zinc-400',
    'focus:outline-none focus:border-[#337ab7] focus:ring-1 focus:ring-[#337ab7]',
    invalid ? 'border-[#d9534f]' : 'border-zinc-400',
  );

/**
 * Classic skin's monitor editor: legacy `?view=monitor&mid=` (and Add /
 * Clone) as `monitor.php` lays it out — the pill rail down the side
 * (Zones is a link), the mini header with Back, Refresh, the title and
 * the ONVIF / Presets buttons, one `label: input` row per field, and
 * Save / Save and close / Cancel under the form. Fields come from the
 * classic catalogue (`classicFields.ts`); state and verbs from the shared
 * {@link useMonitorEditor}.
 *
 * Rendered in the page under the classic nav, not as an overlay, since
 * legacy opens it as its own page.
 */
export function ClassicMonitorEditor(props: ClassicMonitorEditorProps) {
  const qc = useQueryClient();
  // Refresh (legacy reload) throws the draft away and reads the row again.
  const [generation, setGeneration] = useState(0);
  const refresh = () => {
    if (props.monitor) void qc.invalidateQueries({ queryKey: ['monitor', props.monitor.id] });
    setGeneration((g) => g + 1);
  };
  return (
    <ClassicMonitorEditorBody
      key={`${props.monitor?.id ?? 'new'}-${generation}`}
      {...props}
      onRefresh={refresh}
    />
  );
}

function ClassicMonitorEditorBody({
  monitor, seed, onClose, onCreated, initialTab, onTabChange, onRefresh,
}: ClassicMonitorEditorProps & { onRefresh: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePerms();
  const tabs = useClassicMonitorTabs();
  const ed = useMonitorEditor({ tabs, monitor, seed, onClose, onCreated, initialTab });
  const canEdit = can('monitors', 'Edit');
  const [dialog, setDialog] = useState<'preset' | 'onvif' | 'leave' | null>(null);

  const selectTab = (id: string) => {
    ed.setActiveTab(id);
    onTabChange?.(id);
  };

  const toZones = () => {
    if (!monitor) return;
    void navigate({ to: '/monitors/$monitorId/zones', params: { monitorId: String(monitor.id) } });
  };
  // Legacy asks before leaving for Zones with unsaved edits: Save / Do not save / Cancel.
  const openZones = () => {
    if (ed.diffCount > 0) setDialog('leave');
    else toZones();
  };

  const title = monitor
    ? t('Monitor - {{id}} - {{name}}', { id: monitor.id, name: monitor.name })
    : t('Monitor - {{name}}', { name: String(ed.draft.name ?? '') });

  return (
    <ClassicPage>
      <div className="flex gap-3 items-start" data-testid="monitor-editor">
        <nav aria-label={t('Monitor tabs')} className="w-40 shrink-0">
          <ul className="flex flex-col gap-1">
            {ed.tabs.map((tab) => {
              const active = tab.id === ed.activeTabDef.id;
              const isZones = tab.navigatesTo === 'zones';
              const disabled = isZones && ed.isNew;
              const errors = ed.tabErrorCount[tab.id] ?? 0;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => (isZones ? openZones() : selectTab(tab.id))}
                    className={clsx(
                      'w-full text-start px-3 py-1.5 text-sm rounded-sm transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      active ? 'bg-[#337ab7] text-white' : 'text-[#337ab7] hover:bg-zinc-100',
                    )}
                  >
                    {tab.label}
                    {/* Decorative: each invalid field announces itself with role=alert. */}
                    {errors > 0 && <span className="ms-1 text-[#d9534f]" aria-hidden>•</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex-1 min-w-0">
          <ClassicHeader
            title={title}
            onBack={ed.requestClose}
            onRefresh={onRefresh}
            end={canEdit ? (
              <>
                <ClassicIconButton aria-label={t('ONVIF')} onClick={() => setDialog('onvif')}>
                  <Rss size={16} aria-hidden />
                </ClassicIconButton>
                <ClassicIconButton aria-label={t('Presets')} onClick={() => setDialog('preset')}>
                  <ListOrdered size={16} aria-hidden />
                </ClassicIconButton>
              </>
            ) : undefined}
          >
            {canEdit && ed.clonedFrom && (
              <div role="status" className="px-3 py-1.5 text-sm rounded-sm border border-[#bce8f1] bg-[#d9edf7] text-[#31708f]">
                {t('Configuration cloned from Monitor: {{name}}', { name: ed.clonedFrom })}
              </div>
            )}
          </ClassicHeader>

          <ul className="text-sm text-zinc-900">
            {visibleFields(ed.activeTabDef, ed.draft, ed.baseline).map((f, i) => (
              <ClassicFieldRow key={`${f.key}-${i}`} field={f} ed={ed} />
            ))}
          </ul>

          {ed.saveError && (
            <p role="alert" className="mt-3 text-sm text-[#a94442]">{ed.saveError}</p>
          )}
          {ed.saving ? (
            <div role="status" className="mt-3 inline-block px-4 py-2 rounded-sm border border-[#bce8f1] bg-[#d9edf7] text-[#31708f]">
              <h2 className="text-base font-semibold">{t('Please Wait')}</h2>
              <p className="text-sm">{t('Monitor data is saved')}</p>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              {/* Legacy: Save is disabled on a new monitor; only Save and close creates it. */}
              <ClassicButton tone="primary" disabled={!canEdit || ed.isNew || ed.busy} onClick={() => ed.save(false)}>
                {t('Save')}
              </ClassicButton>
              <ClassicButton tone="primary" disabled={!canEdit || ed.busy} onClick={() => ed.save(true)}>
                {t('Save and close')}
              </ClassicButton>
              <ClassicButton onClick={onClose}>{t('Cancel')}</ClassicButton>
            </div>
          )}
        </div>
      </div>

      {dialog === 'preset' && <PresetDialog onApply={ed.applyValues} onClose={() => setDialog(null)} />}
      <DiscoveryDialog open={dialog === 'onvif'} onApply={ed.applyValues} onClose={() => setDialog(null)} />
      <Modal isOpen={dialog === 'leave'} onClose={() => setDialog(null)} title={t('Action Confirmation')}>
        <p className="text-sm mb-3">{t('You are leaving the page.')}<br />{t('Want to save data?')}</p>
        <div className="flex justify-end gap-2">
          <ClassicButton onClick={() => setDialog(null)}>{t('Cancel')}</ClassicButton>
          <ClassicButton tone="danger" onClick={() => { setDialog(null); toZones(); }}>{t('Do not save')}</ClassicButton>
          <ClassicButton tone="primary" onClick={() => { setDialog(null); ed.save(false, toZones); }}>{t('Save')}</ClassicButton>
        </div>
      </Modal>
    </ClassicPage>
  );
}

/* ------------------------------------------------------------------------ */
/*  One `<li><label/> input</li>` row                                       */
/* ------------------------------------------------------------------------ */

function ClassicFieldRow({ field: f, ed }: { field: FieldDef; ed: MonitorEditorState }) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const [helpOpen, setHelpOpen] = useState(false);

  if (f.kind === 'group') {
    return <li className="pt-3 pb-1 mb-1 font-semibold border-b border-zinc-300">{f.label}</li>;
  }

  const error = ed.fieldErrors[f.key];
  const value = ed.draft[f.key];
  const stored = ed.baseline[f.key];

  let control: ReactNode;
  if (f.kind === 'groups') {
    control = <ClassicGroupsSelect value={ed.groupsValue} onChange={ed.setGroups} label={f.label} />;
  } else if (f.kind === 'triggers') {
    // X10 is the only trigger ZoneMinder has, and X10 is not built.
    control = <em>{t('None available')}</em>;
  } else if (f.kind === 'ram-estimate') {
    const ram = estimatedRamUse(ed.draft);
    control = (
      <span data-testid="estimated-ram">
        {ram ? `${t('Min')}: ${ram.min} ${t('Max')}: ${ram.max ?? t('Unlimited')}` : '—'}
      </span>
    );
  } else {
    control = (
      <FieldInput
        field={f}
        monitorId={ed.monitorId ?? 0}
        draft={ed.draft}
        value={value}
        stored={stored}
        invalid={!!error}
        locked={isFieldLocked(f, can)}
        inputClass={classicInput}
        onChange={(v: FieldValue) => ed.updateField(f.key, v)}
        onUpdate={ed.updateField}
      />
    );
  }

  const companion = f.companion;
  return (
    <li className="flex flex-wrap items-start gap-x-3 py-1">
      <span className="w-64 shrink-0 pt-0.5 font-semibold">
        {f.label}
        {f.helpLink && f.help && (
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            aria-expanded={helpOpen}
            aria-label={t('Help for {{field}}', { field: f.label })}
            className="ms-1 font-normal text-[#337ab7] hover:underline"
          >
            (?)
          </button>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 [&_textarea]:w-[32em] [&_textarea]:max-w-full">
          {control}
          {f.suffix && <span>{f.suffix}</span>}
          {companion && (
            <label className="inline-flex items-center gap-1">
              <FieldInput
                field={companion}
                monitorId={ed.monitorId ?? 0}
                draft={ed.draft}
                value={ed.draft[companion.key]}
                stored={ed.baseline[companion.key]}
                invalid={false}
                inputClass={classicInput}
                onChange={(v: FieldValue) => ed.updateField(companion.key, v)}
                onUpdate={ed.updateField}
              />
              {companion.label}
            </label>
          )}
          {f.note && <small className="text-zinc-500">{f.note}</small>}
          {f.cautionWhenSet && value != null && String(value) !== '' && !['Local', 'File'].includes(String(ed.draft.type)) && (
            <span className="text-[#d9534f]">{f.cautionWhenSet}</span>
          )}
          {f.link && (
            <Link to={f.link.to} className="px-2 py-0.5 text-sm rounded-sm border border-zinc-400 bg-zinc-100 hover:bg-zinc-200">
              {f.link.label}
            </Link>
          )}
        </div>
        {storedOnly(f, stored) && f.storedOnlyWarning && (
          <p className="mt-1 text-[#8a6d3b]">{f.storedOnlyWarning}</p>
        )}
        {error && <p role="alert" className="mt-1 text-[#a94442]">{error}</p>}
        {f.help && (!f.helpLink || helpOpen) && <p className="mt-1 text-zinc-600">{f.help}</p>}
      </div>
    </li>
  );
}

/** Legacy General → Groups: a multi-select of the groups (chosen-styled there, native here). */
function ClassicGroupsSelect({ value, onChange, label }: { value: number[]; onChange: (ids: number[]) => void; label: string }) {
  const q = useQuery({
    queryKey: ['groups', { page_size: 500 }],
    queryFn: () => listGroups({ page: 1, page_size: 500 }),
    staleTime: 60_000,
  });
  const groups = q.data?.items ?? [];
  return (
    <select
      multiple
      aria-label={label}
      value={value.map(String)}
      onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => Number(o.value)).sort((a, b) => a - b))}
      size={Math.min(6, Math.max(2, groups.length))}
      className={clsx(classicInput(false), 'min-w-[16em]')}
    >
      {groups.map((g) => (
        <option key={g.id} value={g.id}>{g.name}</option>
      ))}
    </select>
  );
}
