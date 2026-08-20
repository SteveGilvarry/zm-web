import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { parseDefinition } from '@/api/states';
import { isProtectedState, useRunStatePage } from '@/features/state/useRunStatePage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { OptionsRail } from '../components/settings/OptionsRail';

const btn = 'px-2 py-0.5 text-xs border border-zinc-500 rounded-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40';

/** Options → Run State — classic skin: the legacy state table + supervisor buttons. */
export default function ClassicSettingsStatePage() {
  const { t } = useTranslation();
  const rs = useRunStatePage();
  const tabs = useOptionsTabs();
  useDocumentTitle(t('Run State'));

  if (!rs.isAuthenticated) return null;
  const { states, monitors, busy, applyTarget, deleteTarget, daemonTarget } = rs;

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
                <button type="button" onClick={() => rs.setDaemonTarget('start')} disabled={busy} className={btn}>{t('Start')}</button>
                <button type="button" onClick={() => rs.setDaemonTarget('stop')} disabled={busy} className={btn}>{t('Stop')}</button>
                <button type="button" onClick={() => rs.setDaemonTarget('restart')} disabled={busy} className={btn}>{t('Restart')}</button>
                {rs.daemonPending && <span className="text-xs text-zinc-500">{t('Sending…')}</span>}
                {rs.daemonSuccess && <span className="text-xs text-green-700">{rs.daemonMessage ?? t('OK')}</span>}
                {rs.daemonError && <span role="alert" className="text-xs text-red-700">{rs.daemonError.message ?? t('Failed')}</span>}
              </div>

              <div className="bg-white rounded border border-zinc-300 overflow-hidden">
                {rs.statesLoading ? (
                  <div className="p-6 text-center text-zinc-500 text-sm">{t('Loading states…')}</div>
                ) : rs.statesError ? (
                  <div role="alert" className="p-6 text-center text-red-700 text-sm">
                    {t('Failed to load states: {{message}}', { message: rs.statesError.message })}
                  </div>
                ) : states.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-sm">
                    {t('No saved states yet. Snapshot the current monitor configuration below.')}
                  </div>
                ) : (
                  <table className="w-full text-sm text-zinc-800">
                    <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-start font-semibold">{t('Name')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Active')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Definition')}</th>
                        <th className="px-3 py-2 text-end font-semibold">{t('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {states.map((s) => {
                        const isProtected = isProtectedState(s.name);
                        const parsed = parseDefinition(s.definition);
                        return (
                          <tr key={s.id} className="border-b border-zinc-200 hover:bg-zinc-50">
                            <td className="px-3 py-1.5 font-medium">{s.name}</td>
                            <td className="px-3 py-1.5 text-xs">
                              {s.is_active === 1 ? <span className="font-semibold text-green-700">{t('Active')}</span> : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-xs font-mono text-zinc-600 truncate max-w-[20rem]" title={s.definition}>
                              {parsed.length === 0 ? '—' : t('{{count}} monitor', { count: parsed.length })}
                            </td>
                            <td className="px-3 py-1.5 text-end whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => rs.setApplyTarget(s)}
                                disabled={busy || s.is_active === 1}
                                aria-label={t('Apply state {{name}}', { name: s.name })}
                                className={btn}
                              >
                                {t('Apply')}
                              </button>{' '}
                              <button
                                type="button"
                                onClick={() => rs.setDeleteTarget(s)}
                                disabled={busy || isProtected}
                                aria-label={t('Delete state {{name}}', { name: s.name })}
                                title={isProtected ? t('"default" cannot be deleted') : t('Delete state')}
                                className={btn}
                              >
                                {t('Delete')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <form onSubmit={rs.handleSaveCurrent} className="bg-white rounded border border-zinc-300 p-3 flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="cst-state-name" className="text-zinc-700">{t('Save current as…')}</label>
                <input
                  id="cst-state-name"
                  value={rs.newStateName}
                  onChange={(e) => rs.setNewStateName(e.target.value)}
                  placeholder={t('e.g. Away, Holiday')}
                  className="w-60 px-2 py-1 text-sm bg-white border border-zinc-400 rounded-sm text-zinc-900 focus:outline-none focus:border-zinc-600"
                />
                <button
                  type="submit"
                  disabled={!rs.newStateName.trim() || rs.savePending || rs.monitorsLoading || monitors.length === 0}
                  className={clsx(btn)}
                >
                  {t('Save snapshot')}
                </button>
                <span className="text-xs text-zinc-500">{t('{{count}} monitor will be captured.', { count: monitors.length })}</span>
                {rs.saveError && <span role="alert" className="text-xs text-red-700">{rs.saveError.message ?? t('Save failed')}</span>}
              </form>
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
