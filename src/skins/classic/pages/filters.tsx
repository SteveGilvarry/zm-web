import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { FILTER_SORT_FIELDS, type FilterColumns } from '@/api/filters';
import { RuleBuilder } from '@/features/filters/RuleBuilder';
import { MatchesPreview } from '@/features/filters/MatchesPreview';
import { useFilterSortFieldLabels } from '@/features/filters/labels';
import { useFiltersPage, type FlagKey } from '@/features/filters/useFiltersPage';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { classicInput, classicSelect } from '../components/events/styles';
import { ClassicFilterLogPanel } from '../components/FilterLogPanel';

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
    draftColumns: c, setColumn, toggleFlag, canSave, features, idOnFilter,
  } = s;

  if (!s.isAuthenticated) return null;

  const flag = (key: FlagKey) => c[key] === 1;
  // Legacy's Save As writes a new filter under whatever the Name field says
  // (actions/filter.php:93), so it needs a name just as Save does.
  const onSaveAs = () => s.requestSaveAs(draftName);

  const check = (id: string, label: string, flagKey: FlagKey, extra?: ReactNode) => (
    <FlagCheck id={id} label={label} checked={flag(flagKey)} onToggle={() => toggleFlag(flagKey)} extra={extra} />
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
                    {idOnFilter ? `${f.id} ${f.name}` : f.name}
                    {f.background === 1 ? '*' : ''}{f.concurrent === 1 ? '&' : ''}
                  </option>
                ))}
              </select>
              {selectedFilter && (selectedFilter.background === 1 || selectedFilter.concurrent === 1) && (
                <>
                  <span />
                  <span className="text-sm text-zinc-700">
                    {selectedFilter.background === 1 ? t('[background]') : ''}
                    {selectedFilter.background === 1 && selectedFilter.concurrent === 1 ? ' ' : ''}
                    {selectedFilter.concurrent === 1 ? t('[concurrent]') : ''}
                  </span>
                </>
              )}
              {selectedFilter && (
                <>
                  <span className="text-end text-sm text-zinc-700">{t('Id')}</span>
                  <span className="text-sm text-zinc-900 font-mono">{selectedFilter.id}</span>
                </>
              )}
              <label htmlFor="filter-name" className="text-end text-sm text-zinc-700">{t('Name')}</label>
              <input id="filter-name" value={draftName} maxLength={64} onChange={(e) => setDraftName(e.target.value)} className={clsx(classicInput, 'w-full')} />
              <label htmlFor="filter-user" className="text-end text-sm text-zinc-700">{t('User to run filter as')}</label>
              <select
                id="filter-user"
                value={String(s.draftUserId ?? '')}
                onChange={(e) => setColumn('user_id', e.target.value === '' ? null : Number(e.target.value))}
                className={clsx(classicSelect, 'w-40')}
                disabled={users.length === 0}
                title={users.length === 0 ? t('Listing users needs System view permission.') : undefined}
              >
                {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>

            {/* Terms + sort: legacy's "Query" fieldset (filter.php:189, new since 1.39.22). */}
            <fieldset id="QueryOptions" className="max-w-4xl mx-auto border border-[#dee2e6] px-3 pb-3">
              <legend className="px-1 text-base">{t('Query')}</legend>
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
                    <select
                      id="filter-skip-locked"
                      value={draftQuery.skip_locked === '1' ? '1' : '0'}
                      onChange={(e) => setDraftQuery({ ...draftQuery, skip_locked: e.target.value })}
                      title={t('Leave out events another filter is already working on. Requires Lock Rows.')}
                      className={classicSelect}
                    >
                      <option value="0">{t('No')}</option>
                      <option value="1">{t('Yes')}</option>
                    </select>
                    <label htmlFor="filter-limit">{t('Limit to first')}</label>
                    <input id="filter-limit" type="number" min={0} value={draftQuery.limit ?? '0'} onChange={(e) => setDraftQuery({ ...draftQuery, limit: e.target.value.replace(/[^\d]/g, '') || '0' })} className={clsx(classicInput, 'w-24')} />
                    <span>{t('results only')}</span>
                  </div>
                </>
              ) : null}
            </fieldset>
          </div>

          {/* Actions / Options, each control beside its checkbox as in filter.php:245-366. */}
          <div className="grid grid-cols-2 gap-8 px-4 py-3 border-b border-[#337ab7]">
            <section>
              <h2 className="text-center text-xl mb-2">{t('Actions')}</h2>
              <div className="flex flex-col items-end gap-y-2 pe-[30%]">
                {check('f-archive', t('Archive all matches'), 'auto_archive')}
                {check('f-unarchive', t('Unarchive all matches'), 'auto_unarchive')}
                {check('f-disk', t('Update used disk space'), 'update_disk_space')}
                {features.video && check('f-video', t('Create video for all matches'), 'auto_video')}
                {features.upload && check('f-upload', t('Upload all matches'), 'auto_upload')}
                {features.email && check('f-email', t('Email details of all matches'), 'auto_email')}
                {features.message && check('f-message', t('Message details of all matches'), 'auto_message')}
                {/* System editors only; the command box sits beside the checkbox. */}
                {features.executeCmd && check('f-execute', t('Execute command on all matches'), 'auto_execute', (
                  <input
                    aria-label={t('Command')}
                    value={c.auto_execute_cmd ?? ''}
                    maxLength={255}
                    onChange={(e) => setColumn('auto_execute_cmd', e.target.value)}
                    className={clsx(classicInput, 'w-56 font-mono')}
                  />
                ))}
                {check('f-delete', t('Delete all matches'), 'auto_delete')}
                {/* The target select stays hidden until the box is ticked. */}
                {check('f-copy', t('Copy all matches'), 'auto_copy', flag('auto_copy') && (
                  <StorageSelect label={t('Copy to')} value={c.auto_copy_to} storage={storage} onChange={(v) => setColumn('auto_copy_to', v)} />
                ))}
                {check('f-move', t('Move all matches'), 'auto_move', flag('auto_move') && (
                  <StorageSelect label={t('Move to')} value={c.auto_move_to} storage={storage} onChange={(v) => setColumn('auto_move_to', v)} />
                ))}
              </div>
              {s.deleteEverythingRisk && (
                <p className="mt-2 text-xs text-[#a94442]" role="alert">
                  {t('No conditions + Delete all matches = every event will be deleted when this filter runs.')}
                </p>
              )}
            </section>
            <section>
              <h2 className="text-center text-xl mb-2">{t('Options')}</h2>
              <div className="flex flex-col items-end gap-y-2 pe-[30%]">
                {check('f-background', t('Run filter in background'), 'background')}
                <label htmlFor="f-interval" className="flex items-center justify-end gap-2 text-sm text-zinc-700">
                  {t('Execute Interval')}
                  <input id="f-interval" type="number" min={0} value={c.execute_interval} onChange={(e) => setColumn('execute_interval', Math.max(0, parseInt(e.target.value || '0', 10) || 0))} className={clsx(classicInput, 'w-28')} />
                  <span>{t('seconds')}</span>
                </label>
                {check('f-concurrent', t('Run filter concurrently'), 'concurrent')}
                {check('f-lock', t('Lock Rows'), 'lock_rows')}
                {/* EmailOptions: under Options, shown while Email is ticked (filter.php:350-385). */}
                {features.email && flag('auto_email') && (
                  <div id="EmailOptions" className="flex flex-col items-end gap-y-2">
                    <LabelledField id="f-email-to" label={t('Email To')}>
                      <input id="f-email-to" type="email" multiple value={c.email_to ?? ''} onChange={(e) => setColumn('email_to', e.target.value)} className={clsx(classicInput, 'w-56')} />
                    </LabelledField>
                    <LabelledField id="f-email-subject" label={t('Email Subject')}>
                      <input id="f-email-subject" value={c.email_subject ?? ''} onChange={(e) => setColumn('email_subject', e.target.value)} className={clsx(classicInput, 'w-56')} />
                    </LabelledField>
                    <LabelledField id="f-email-body" label={t('Email Body')}>
                      <textarea
                        id="f-email-body"
                        value={c.email_body ?? ''}
                        onChange={(e) => setColumn('email_body', e.target.value)}
                        // Legacy sizes the box to the body's own line count.
                        rows={Math.max(1, (c.email_body ?? '').split('\n').length)}
                        className={clsx(classicInput, 'w-56 font-mono')}
                      />
                    </LabelledField>
                    <div role="radiogroup" aria-label={t('Email Format')} className="flex items-center gap-3 text-sm text-zinc-700">
                      <span>{t('Email Format')}</span>
                      {(['Individual', 'Summary'] as const).map((format) => (
                        <label key={format} className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name="email-format"
                            value={format}
                            checked={(c.email_format || 'Individual') === format}
                            onChange={() => setColumn('email_format', format)}
                          />
                          {format === 'Individual' ? t('Individual') : t('Summary')}
                        </label>
                      ))}
                    </div>
                    <LabelledField id="f-email-server" label={t('Email Server')}>
                      <input
                        id="f-email-server"
                        value={c.email_server ?? ''}
                        onChange={(e) => setColumn('email_server', e.target.value || null)}
                        placeholder={features.emailHost}
                        className={clsx(classicInput, 'w-56')}
                      />
                    </LabelledField>
                  </div>
                )}
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
              <button type="button" onClick={s.requestSave} disabled={!canSave || s.savePending || s.createPending} className={grey}>{t('Save')}</button>
              <button type="button" onClick={onSaveAs} disabled={!draftQuery || !draftName.trim() || !s.canWeEdit || s.createPending} className={grey}>{t('Save As')}</button>
              <button
                type="button"
                onClick={() => { if (selectedFilter) s.requestDelete(selectedFilter); }}
                disabled={!s.canDelete}
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

          {/* New in 1.39.41: the saved filter's own log, under the form. */}
          {selectedFilter && <ClassicFilterLogPanel filterId={selectedFilter.id} />}
        </QueryState>
      </main>

      {s.confirm && (
        <ConfirmDialog
          isOpen
          onClose={s.confirm.cancel}
          onConfirm={s.confirm.accept}
          title={s.confirm.title}
          message={s.confirm.message}
          confirmText={s.confirm.confirmText}
          variant={s.confirm.variant}
        />
      )}
    </AppShell>
  );
}

function FlagCheck({ id, label, checked, onToggle, extra }: {
  id: string; label: string; checked: boolean; onToggle: () => void;
  /** What legacy puts after the checkbox on the same line (command box, target select). */
  extra?: ReactNode;
}) {
  return (
    <span className="flex items-center justify-end gap-2 text-sm text-zinc-700">
      <label htmlFor={id} className="flex items-center gap-2">
        {label}
        <input id={id} type="checkbox" checked={checked} onChange={onToggle} className="w-4 h-4" />
      </label>
      {extra}
    </span>
  );
}

function LabelledField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <span className="flex items-center justify-end gap-2 text-sm text-zinc-700">
      <label htmlFor={id}>{label}</label>
      {children}
    </span>
  );
}

/** Legacy's `$storageareas`: NULL Unspecified, Zero, then the areas by name (filter.php:109). */
function StorageSelect({ label, value, storage, onChange }: {
  label: string; value: FilterColumns['auto_copy_to']; storage: Array<{ id: number; name: string; path: string }>;
  onChange: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      aria-label={label}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10) || 0)}
      className={classicSelect}
    >
      <option value="">{t('NULL Unspecified')}</option>
      <option value="0">{t('Zero')}</option>
      {storage.map((st) => <option key={st.id} value={String(st.id)}>{st.name}</option>)}
    </select>
  );
}
