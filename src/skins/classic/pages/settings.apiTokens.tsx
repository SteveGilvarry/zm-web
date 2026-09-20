import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useApiTokensPage } from '@/features/settings/useApiTokensPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, ClassicToolbar, classicTd, classicTh } from '../components/settings/primitives';

/**
 * Options → API — classic skin, legacy `_options_api.php`: Username /
 * Revoke Token / API Enabled, [Update] on the start side and the red
 * [Revoke All Tokens] on the end. Legacy's [New Token] is gone with
 * sessions, so it is not rendered.
 */
export default function ClassicSettingsApiTokensPage() {
  const { t } = useTranslation();
  const a = useApiTokensPage();
  const tabs = useOptionsTabs();
  useSiteTitle(t('API'));

  if (!a.isAuthenticated) return null;

  return (
    <AppShell title={t('API')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="api" />
            <div className="flex-1 min-w-0 space-y-3">
              <RequirePerm feature="system" level="View" fallback="message">
                {!a.apiOptionEnabled ? (
                  <p role="alert" className="text-sm text-[#a94442] bg-[#f2dede] border border-[#ebccd1] rounded-sm px-3 py-2">
                    {t('APIs are disabled. To enable, please turn on OPT_USE_API in Options->System')}
                  </p>
                ) : (
                  <>
                    <ClassicToolbar
                      end={
                        <RequirePerm feature="system" level="Edit">
                          <ClassicButton tone="danger" onClick={a.askRevokeAll} disabled={a.isRevokingAll}>
                            {t('Revoke All Tokens')}
                          </ClassicButton>
                        </RequirePerm>
                      }
                    >
                      <RequirePerm feature="system" level="Edit">
                        <ClassicButton
                          tone="primary"
                          onClick={a.save}
                          disabled={a.dirtyCount === 0 || a.isSaving}
                        >
                          {t('Update')}
                        </ClassicButton>
                        <ClassicButton onClick={a.resetDraft} disabled={a.dirtyCount === 0}>
                          {t('Cancel')}
                        </ClassicButton>
                      </RequirePerm>
                    </ClassicToolbar>

                    <QueryState
                      isLoading={a.isLoading}
                      isError={a.isError}
                      error={a.error}
                      onRetry={a.refetch}
                      empty={a.rows.length === 0}
                      emptyMessage={t('No matching records found')}
                    >
                      <ClassicTable>
                        <thead>
                          <tr>
                            <th className={classicTh}>{t('Username')}</th>
                            <th className={classicTh}>{t('Revoke Token')}</th>
                            <th className={classicTh}>{t('API Enabled')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.rows.map((row) => (
                            <tr key={row.user.id}>
                              <td className={classicTd}>{row.user.username}</td>
                              <td className={classicTd}>
                                <input
                                  type="checkbox"
                                  checked={row.revoke}
                                  disabled={!a.canEdit}
                                  onChange={() => a.toggleRevoke(row.user.id)}
                                  aria-label={t('Revoke tokens for {{name}}', { name: row.user.username })}
                                />
                              </td>
                              <td className={classicTd}>
                                <input
                                  type="checkbox"
                                  checked={row.apiEnabled}
                                  disabled={!a.canEdit}
                                  onChange={(e) => a.setApiEnabled(row.user.id, e.target.checked)}
                                  aria-label={t('API enabled for {{name}}', { name: row.user.username })}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </ClassicTable>
                    </QueryState>
                  </>
                )}
              </RequirePerm>
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={a.confirmingRevokeAll}
        onClose={a.cancelRevokeAll}
        onConfirm={a.confirmRevokeAll}
        title={t('Revoke All Tokens')}
        message={t('Revoke every outstanding API token? Anything signed in with one will have to sign in again.')}
        confirmText={t('Revoke All Tokens')}
        variant="danger"
        isLoading={a.isRevokingAll}
      />
    </AppShell>
  );
}
