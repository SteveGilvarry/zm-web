import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { FILTER_SORT_FIELDS, type FilterColumns } from '@/api/filters';
import { RuleBuilder } from '@/features/filters/RuleBuilder';
import { MatchesPreview } from '@/features/filters/MatchesPreview';
import { useFilterSortFieldLabels } from '@/features/filters/labels';
import { useFiltersPage, type FlagKey } from '@/features/filters/useFiltersPage';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { classicInput, classicSelect } from '../components/events/styles';

const btnBar = 'px-3 py-1.5 text-xs font-semibold uppercase border rounded-sm disabled:opacity-50 disabled:cursor-not-allowed';
const grey = clsx(btnBar, 'bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]');
const blue = clsx(btnBar, 'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090]');

/**
 * Filters — classic skin, the single legacy `?view=filter` form: "Use
 * Filter" chooser, Name, run-as user, the term rows, Sort by / Skip locked /
 * Limit, the Actions and Options checkbox columns and the button bar
 * (List / View / Export matches, Execute, Save, Save As, Delete, Debug, Reset).
 */
export default function ClassicFiltersPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Filters'));
  const s = useFiltersPage();
  const sortLabels = useFilterSortFieldLabels();
  const [showDebug, setShowDebug] = useState(false);
  const {
    filters, monitors, storage, users, selectedId, selectedFilter, startEditing,
    draftName, setDraftName, draftQuery, setDraftQuery, unreadable,
    draftColumns: c, setColumn, toggleFlag, canSave,
  } = s;

  if (!s.isAuthenticated) return null;

  const flag = (key: FlagKey) => c[key] === 1;
  const onSave = () => {
    if (s.deleteEverythingRisk && !confirm(t('This filter has no conditions and deletes its matches. Once the daemon runs it, every event will be deleted. Save anyway?'))) return;
    if (selectedId) s.save();
    else s.create();
  };
  const onSaveAs = () => {
    const name = prompt(t('Save filter as'), draftName ? t('{{name}} copy', { name: draftName }) : '');
    if (name) s.saveAs(name);
  };

  const check = (id: string, label: string, flagKey: FlagKey) => (
    <FlagCheck id={id} label={label} checked={flag(flagKey)} onToggle={() => toggleFlag(flagKey)} />
  );

  return (
    <AppShell title={t('Filters')}>
      <main className="flex-1 overflow-auto bg-white text-zinc-900">
        <QueryState isLoading={s.isLoading} isError={s.isError} error={s.error} onRetry={s.refetch}>
          {/* Header rows: Use Filter / Name / run as */}
          <div className="px-4 py-2 border-b border-[#dee2e6] space-y-2">
            <div className="grid grid-cols-[10rem_minmax(0,32rem)] items-center gap-x-2 gap-y-2 justify-center">
              <label htmlFor="use-filter" className="text-end text-sm text-zinc-700">{t('Use Filter')}</label>
              <select
                id="use-filter"
                value={selectedId ?? ''}
                onChange={(e) => startEditing(filters.find((f) => f.id === Number(e.target.value)) ?? null)}
                className={clsx(classicSelect, 'w-full')}
              >
                <option value="">{t('Choose Filter')}</option>
                {filters.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}{f.background === 1 ? '*' : ''}{f.concurrent === 1 ? '&' : ''}
                  </option>
                ))}
              </select>
              <label htmlFor="filter-name" className="text-end text-sm text-zinc-700">{t('Name')}</label>
              <input id="filter-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} className={clsx(classicInput, 'w-full')} />
              <label htmlFor="filter-user" className="text-end text-sm text-zinc-700">{t('User to run filter as')}</label>
              <select
                id="filter-user"
                value={c.user_id ?? ''}
                onChange={(e) => setColumn('user_id', e.target.value === '' ? null : Number(e.target.value))}
                className={clsx(classicSelect, 'w-40')}
                disabled={users.length === 0}
                title={users.length === 0 ? t('Listing users needs System view permission.') : undefined}
              >
                <option value="">{t('— none —')}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>

            {/* Terms */}
            <div className="max-w-4xl mx-auto">
              {unreadable ? (
                <div className="border border-[#ffeeba] bg-[#fff3cd] text-[#856404] text-xs p-2 space-y-1" data-testid="unreadable-query">
                  <p>
                    {t('This filter’s conditions are stored in a format the dashboard cannot read ({{reason}}). They are shown as-is and will not be changed; saving is disabled so nothing is overwritten. Edit it in the legacy ZoneMinder UI.', { reason: unreadable.reason })}
                  </p>
                  <pre className="font-mono whitespace-pre-wrap break-all">{unreadable.raw}</pre>
                </div>
              ) : draftQuery ? (
                <>
                  <RuleBuilder query={draftQuery} monitors={monitors} storage={storage} onChange={setDraftQuery} />
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-700">
                    <label htmlFor="filter-sort">{t('Sort by')}</label>
                    <select id="filter-sort" value={draftQuery.sort_field ?? ''} onChange={(e) => setDraftQuery({ ...draftQuery, sort_field: e.target.value })} className={classicSelect}>
                      {FILTER_SORT_FIELDS.map((f) => <option key={f} value={f}>{sortLabels[f]}</option>)}
                    </select>
                    <select aria-label={t('Sort direction')} value={draftQuery.sort_asc === '1' ? '1' : '0'} onChange={(e) => setDraftQuery({ ...draftQuery, sort_asc: e.target.value })} className={classicSelect}>
                      <option value="1">{t('Asc')}</option>
                      <option value="0">{t('Desc')}</option>
                    </select>
                    <label htmlFor="filter-skip-locked">{t('Skip Locked')}</label>
                    <select id="filter-skip-locked" value={draftQuery.skip_locked === '1' ? '1' : '0'} onChange={(e) => setDraftQuery({ ...draftQuery, skip_locked: e.target.value })} className={classicSelect}>
                      <option value="0">{t('No')}</option>
                      <option value="1">{t('Yes')}</option>
                    </select>
                    <label htmlFor="filter-limit">{t('Limit to first')}</label>
                    <input id="filter-limit" type="number" min={0} value={draftQuery.limit ?? '0'} onChange={(e) => setDraftQuery({ ...draftQuery, limit: e.target.value.replace(/[^\d]/g, '') || '0' })} className={clsx(classicInput, 'w-24')} />
                    <span>{t('results only')}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Actions / Options */}
          <div className="grid grid-cols-2 gap-8 px-4 py-3 border-b border-[#337ab7]">
            <section>
              <h2 className="text-center text-xl mb-2">{t('Actions')}</h2>
              <div className="grid grid-cols-[1fr_1fr] gap-y-2">
                <div className="col-span-2 grid grid-cols-[1fr_minmax(0,12rem)] gap-y-2 justify-items-end pe-[40%]">
                  {check('f-archive', t('Archive all matches'), 'auto_archive')}
                  <span />
                  {check('f-unarchive', t('Unarchive all matches'), 'auto_unarchive')}
                  <span />
                  {check('f-disk', t('Update used disk space'), 'update_disk_space')}
                  <span />
                  {check('f-video', t('Create video for all matches'), 'auto_video')}
                  <span />
                  {check('f-upload', t('Upload all matches'), 'auto_upload')}
                  <span />
                  {check('f-email', t('Email details of all matches'), 'auto_email')}
                  <span />
                  {check('f-message', t('Message details of all matches'), 'auto_message')}
                  <span />
                  {check('f-execute', t('Execute command on all matches'), 'auto_execute')}
                  <span />
                  {check('f-delete', t('Delete all matches'), 'auto_delete')}
                  <span />
                  {check('f-copy', t('Copy all matches'), 'auto_copy')}
                  <span />
                  {check('f-move', t('Move all matches'), 'auto_move')}
                  <span />
                </div>
              </div>
              {flag('auto_execute') && (
                <input aria-label={t('Command')} value={c.auto_execute_cmd ?? ''} onChange={(e) => setColumn('auto_execute_cmd', e.target.value)} placeholder="/usr/local/bin/notify.sh %EI%" className={clsx(classicInput, 'w-full mt-2 font-mono')} />
              )}
              {flag('auto_email') && (
                <div className="mt-2 space-y-1">
                  <input aria-label={t('Email to')} value={c.email_to ?? ''} onChange={(e) => setColumn('email_to', e.target.value)} placeholder={t('Email to')} className={clsx(classicInput, 'w-full')} />
                  <input aria-label={t('Subject')} value={c.email_subject ?? ''} onChange={(e) => setColumn('email_subject', e.target.value)} placeholder={t('Subject')} className={clsx(classicInput, 'w-full')} />
                  <textarea aria-label={t('Body')} value={c.email_body ?? ''} onChange={(e) => setColumn('email_body', e.target.value)} rows={3} placeholder={t('Body')} className={clsx(classicInput, 'w-full font-mono')} />
                  <select aria-label={t('Format')} value={c.email_format || 'Individual'} onChange={(e) => setColumn('email_format', e.target.value)} className={classicSelect}>
                    <option value="Individual">{t('Individual (one email per event)')}</option>
                    <option value="Summary">{t('Summary (one email per run)')}</option>
                  </select>
                </div>
              )}
              {(flag('auto_copy') || flag('auto_move')) && (
                <div className="mt-2 space-y-1">
                  {flag('auto_copy') && <StorageSelect label={t('Copy to')} value={c.auto_copy_to} storage={storage} onChange={(v) => setColumn('auto_copy_to', v)} />}
                  {flag('auto_move') && <StorageSelect label={t('Move to')} value={c.auto_move_to} storage={storage} onChange={(v) => setColumn('auto_move_to', v)} />}
                </div>
              )}
              {s.deleteEverythingRisk && (
                <p className="mt-2 text-xs text-[#a94442]" role="alert">
                  {t('No conditions + Delete all matches = every event will be deleted when this filter runs.')}
                </p>
              )}
            </section>
            <section>
              <h2 className="text-center text-xl mb-2">{t('Options')}</h2>
              <div className="grid grid-cols-[1fr_minmax(0,12rem)] gap-y-2 justify-items-end pe-[30%]">
                {check('f-background', t('Run filter in background'), 'background')}
                <span />
                <label htmlFor="f-interval" className="flex items-center justify-end gap-2 text-sm text-zinc-700">
                  {t('Execute Interval')}
                  <input id="f-interval" type="number" min={0} value={c.execute_interval} onChange={(e) => setColumn('execute_interval', Math.max(0, parseInt(e.target.value || '0', 10) || 0))} className={clsx(classicInput, 'w-28')} />
                  <span>{t('seconds')}</span>
                </label>
                <span />
                {check('f-concurrent', t('Run filter concurrently'), 'concurrent')}
                <span />
                {check('f-lock', t('Lock Rows'), 'lock_rows')}
                <span />
              </div>
            </section>
          </div>

          {/* Button bar */}
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-b border-[#dee2e6]">
            {draftQuery && (
              <MatchesPreview
                variant="classic"
                query={draftQuery}
                monitors={monitors}
                reviewSearch={s.reviewSearch}
                actions={{ archive: flag('auto_archive'), unarchive: flag('auto_unarchive'), delete: flag('auto_delete') }}
              />
            )}
            <RequirePerm feature="events" level="Edit">
              <button type="button" onClick={onSave} disabled={!canSave || s.savePending || s.createPending} className={grey}>{t('Save')}</button>
              <button type="button" onClick={onSaveAs} disabled={!draftQuery || s.createPending} className={grey}>{t('Save As')}</button>
              <button
                type="button"
                onClick={() => { if (selectedFilter && confirm(t('Delete filter "{{name}}"?', { name: selectedFilter.name }))) s.remove(selectedFilter.id); }}
                disabled={!selectedFilter}
                className={grey}
              >
                {t('Delete')}
              </button>
            </RequirePerm>
            <button type="button" onClick={() => setShowDebug((v) => !v)} aria-pressed={showDebug} className={blue}>{t('Debug')}</button>
            <button type="button" onClick={s.reset} className={blue}>{t('Reset')}</button>
          </div>

          {showDebug && s.debug && (
            <pre data-testid="filter-debug" className="m-4 p-2 bg-[#f8f9fa] border border-[#dee2e6] font-mono text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(s.debug.source === 'backend' ? s.debug.backendAst : s.debug.ast, null, 2)}
            </pre>
          )}
        </QueryState>
      </main>
    </AppShell>
  );
}

function FlagCheck({ id, label, checked, onToggle }: { id: string; label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label htmlFor={id} className="flex items-center justify-end gap-2 text-sm text-zinc-700">
      {label}
      <input id={id} type="checkbox" checked={checked} onChange={onToggle} className="w-4 h-4" />
    </label>
  );
}

function StorageSelect({ label, value, storage, onChange }: {
  label: string; value: FilterColumns['auto_copy_to']; storage: Array<{ id: number; name: string; path: string }>;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      {label}
      <select value={String(value ?? 0)} onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} className={classicSelect}>
        <option value="0">{t('Zero (unspecified)')}</option>
        {storage.map((st) => <option key={st.id} value={String(st.id)}>{st.name} — {st.path}</option>)}
      </select>
    </label>
  );
}

