import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { parseDefinition } from '@/api/states';
import { isProtectedState, useRunStatePage } from '@/features/state/useRunStatePage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, classicInput, classicLink, classicTd, classicTh } from '../components/settings/primitives';

/** Options → Run State — classic skin: the legacy state table + supervisor buttons. */
export default function ClassicSettingsStatePage() {
  const { t } = useTranslation();
  const rs = useRunStatePage();
  const tabs = useOptionsTabs();
  const { can } = usePerms();
  useSiteTitle(t('Run State'));

  if (!rs.isAuthenticated) return null;
  const { states, monitors, busy, applyTarget, deleteTarget, daemonTarget } = rs;
  const canEdit = can('system', 'Edit');

  return (
    <AppShell title={t('Run State')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="state" />
            <div className="flex-1 min-w-0 space-y-3">
              <div className="bg-white rounded border border-zinc-300 p-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-zinc-700 me-2">{t('Daemon supervisor')}:</span>
                <RequirePerm feature="system" level="Edit" fallback="message">
                  <ClassicButton onClick={() => rs.setDaemonTarget('start')} disabled={busy}>{t('Start')}</ClassicButton>
                  <ClassicButton onClick={() => rs.setDaemonTarget('stop')} disabled={busy}>{t('Stop')}</ClassicButton>
                  <ClassicButton onClick={() => rs.setDaemonTarget('restart')} disabled={busy}>{t('Restart')}</ClassicButton>
                </RequirePerm>
                {rs.daemonPending && <span className="text-xs text-zinc-500">{t('Sending…')}</span>}
                {rs.daemonSuccess && <span className="text-xs text-green-700">{rs.daemonMessage ?? t('OK')}</span>}
                {rs.daemonError && <span role="alert" className="text-xs text-red-700">{rs.daemonError.message ?? t('Failed')}</span>}
              </div>

              <QueryState
                isLoading={rs.statesLoading}
                isError={rs.statesIsError}
                error={rs.statesRawError}
                onRetry={rs.refetchStates}
                empty={states.length === 0}
                emptyMessage={t('No saved states yet. Snapshot the current monitor configuration below.')}
              >
                <ClassicTable>
                  <thead>
                    <tr>
                      <th className={classicTh}>{t('Name')}</th>
                      <th className={classicTh}>{t('Active')}</th>
                      <th className={classicTh}>{t('Definition')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((s) => {
                      const isProtected = isProtectedState(s.name);
                      const parsed = parseDefinition(s.definition);
                      const renaming = rs.renameTarget?.id === s.id;
                      const expanded = rs.previewId === s.id;
                      return (
                        <Fragment key={s.id}>
                          <tr>
                            <td className={clsx(classicTd, 'font-medium')}>
                              {renaming ? (
                                <input
                                  value={rs.renameValue}
                                  onChange={(e) => rs.setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') rs.commitRename();
                                    if (e.key === 'Escape') rs.cancelRename();
                                  }}
                                  onBlur={rs.commitRename}
                                  autoFocus
                                  aria-label={t('New name for {{name}}', { name: s.name })}
                                  className={clsx(classicInput, 'w-40')}
                                />
                              ) : canEdit && !isProtected ? (
                                <button
                                  type="button"
                                  onClick={() => rs.startRename(s)}
                                  aria-label={t('Rename {{name}}', { name: s.name })}
                                  title={t('Rename')}
                                  className={classicLink}
                                >
                                  {s.name}
                                </button>
                              ) : s.name}
                            </td>
                            <td className={clsx(classicTd, 'text-xs')}>
                              {s.is_active === 1 ? <span className="font-semibold text-green-700">{t('Active')}</span> : '—'}
                            </td>
                            <td className={clsx(classicTd, 'text-xs font-mono text-zinc-600')}>
                              {parsed.length === 0 ? '—' : (
                                <button
                                  type="button"
                                  onClick={() => rs.togglePreview(s.id)}
                                  aria-expanded={expanded}
                                  aria-label={t('Show definition of {{name}}', { name: s.name })}
                                  className={classicLink}
                                >
                                  {t('{{count}} monitor', { count: parsed.length })} {expanded ? '▾' : '▸'}
                                </button>
                              )}
                            </td>
                            <td className={clsx(classicTd, 'text-end whitespace-nowrap')}>
                              <RequirePerm feature="system" level="Edit">
                                <ClassicButton
                                  onClick={() => rs.setApplyTarget(s)}
                                  disabled={busy || s.is_active === 1}
                                  aria-label={t('Apply state {{name}}', { name: s.name })}
                                >
                                  {t('Apply')}
                                </ClassicButton>{' '}
                                <ClassicButton
                                  onClick={() => rs.setDeleteTarget(s)}
                                  disabled={busy || isProtected}
                                  aria-label={t('Delete state {{name}}', { name: s.name })}
                                  title={isProtected ? t('"default" cannot be deleted') : t('Delete state')}
                                >
                                  {t('Delete')}
                                </ClassicButton>
                              </RequirePerm>
                            </td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={4} className="px-3 py-2 bg-zinc-50 border-b border-zinc-200">
                                <table className="text-xs w-full max-w-2xl" aria-label={t('Definition of {{name}}', { name: s.name })}>
                                  <thead>
                                    <tr className="text-zinc-600">
                                      <th className="text-start px-2 py-1 font-semibold">{t('Monitor')}</th>
                                      <th className="text-start px-2 py-1 font-semibold">{t('Capturing')}</th>
                                      <th className="text-start px-2 py-1 font-semibold">{t('Analysing')}</th>
                                      <th className="text-start px-2 py-1 font-semibold">{t('Recording')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rs.definitionRows(s).map((r) => (
                                      <tr key={r.id} className={clsx(!r.known && 'text-zinc-400 italic')}>
                                        <td className="px-2 py-0.5"><span className="font-mono text-zinc-500 me-1">#{r.id}</span>{r.name}{!r.known && <span className="ms-1">({t('no longer exists')})</span>}</td>
                                        <td className="px-2 py-0.5 font-mono">{r.capturing}</td>
                                        <td className="px-2 py-0.5 font-mono">{r.analysing}</td>
                                        <td className="px-2 py-0.5 font-mono">{r.recording}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </ClassicTable>
              </QueryState>

              {canEdit && (
              <form onSubmit={rs.handleSaveCurrent} className="bg-white rounded border border-zinc-300 p-3 flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="cst-state-name" className="text-zinc-700">{t('Save current as…')}</label>
                <input
                  id="cst-state-name"
                  value={rs.newStateName}
                  onChange={(e) => rs.setNewStateName(e.target.value)}
                  placeholder={t('e.g. Away, Holiday')}
                  className={clsx(classicInput, 'w-60')}
                />
                <ClassicButton
                  type="submit"
                  tone="primary"
                  disabled={!rs.newStateName.trim() || rs.savePending || rs.monitorsLoading || monitors.length === 0}
                >
                  {t('Save snapshot')}
                </ClassicButton>
                <span className="text-xs text-zinc-500">{t('{{count}} monitor will be captured.', { count: monitors.length })}</span>
                {rs.saveError && <span role="alert" className="text-xs text-red-700">{rs.saveError.message ?? t('Save failed')}</span>}
              </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={!!applyTarget}
        onClose={() => rs.setApplyTarget(null)}
        onConfirm={rs.confirmApply}
        title={t('Apply run state')}
        message={applyTarget ? t('Apply state "{{name}}"? Every monitor\'s Capturing / Analysing / Recording mode will be overwritten and affected daemons restarted.', { name: applyTarget.name }) : ''}
        confirmText={t('Apply')}
        variant="warning"
        isLoading={rs.applyPending}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => rs.setDeleteTarget(null)}
        onConfirm={rs.confirmDelete}
        title={t('Delete state')}
        message={deleteTarget ? t('Delete saved state "{{name}}"? This removes the preset only — it does not change any monitor\'s current mode.', { name: deleteTarget.name }) : ''}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={rs.deletePending}
      />
      <ConfirmDialog
        isOpen={daemonTarget !== null}
        onClose={() => rs.setDaemonTarget(null)}
        onConfirm={rs.confirmDaemon}
        title={daemonTarget === 'stop' ? t('Stop ZoneMinder') : daemonTarget === 'restart' ? t('Restart ZoneMinder') : t('Start ZoneMinder')}
        message={
          daemonTarget === 'stop'
            ? t('Stop ZoneMinder? Recording will halt across every monitor.')
            : daemonTarget === 'restart'
              ? t('Restart ZoneMinder? Capture streams will reconnect after a short outage.')
              : t('Start ZoneMinder? Capture and analysis daemons will launch for every enabled monitor.')
        }
        confirmText={daemonTarget === 'stop' ? t('Stop') : daemonTarget === 'restart' ? t('Restart') : t('Start')}
        variant={daemonTarget === 'stop' ? 'danger' : 'warning'}
        isLoading={rs.daemonPending}
      />
    </AppShell>
  );
}
