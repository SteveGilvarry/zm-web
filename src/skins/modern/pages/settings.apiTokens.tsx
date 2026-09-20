import { useTranslation } from 'react-i18next';
import { Loader2, Save, ShieldOff } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useApiTokensPage } from '@/features/settings/useApiTokensPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

const th = 'px-4 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const td = 'px-4 py-2 border-t border-border-subtle';

/**
 * Settings → API access. Per-user API access and token revocation, the two
 * things `PUT /users/{id}` can do to a token (`api_enabled`,
 * `token_min_expiry`). Issuing tokens is not one of them.
 */
export default function SettingsApiTokensPage() {
  const { t } = useTranslation();
  const a = useApiTokensPage();
  useSiteTitle(t('API Access'));

  if (!a.isAuthenticated) return null;

  return (
    <AppShell title={t('API Access')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="View" fallback="message">
          <div className="mx-auto w-full max-w-[900px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-fg">{t('API Access')}</h2>
                <p className="text-xs text-fg-dim mt-0.5">
                  {t('Revoking a token forces that user to sign in again. Tokens cannot be issued from here.')}
                </p>
              </div>
              <RequirePerm feature="system" level="Edit">
                <div className="flex items-center gap-2">
                  {a.dirtyCount > 0 && (
                    <Button size="sm" variant="ghost" onClick={a.resetDraft}>
                      {t('Discard')}
                    </Button>
                  )}
                  <Button size="sm" onClick={a.save} disabled={a.dirtyCount === 0 || a.isSaving}>
                    {a.isSaving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />}
                    {t('Save')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={a.askRevokeAll} disabled={a.isRevokingAll}>
                    <ShieldOff size={13} aria-hidden />
                    {t('Revoke All Tokens')}
                  </Button>
                </div>
              </RequirePerm>
            </div>

            {!a.apiOptionEnabled ? (
              <p role="alert" className="text-sm text-danger">
                {t('APIs are disabled. To enable, please turn on OPT_USE_API in Options->System')}
              </p>
            ) : (
              <QueryState
                isLoading={a.isLoading}
                isError={a.isError}
                error={a.error}
                onRetry={a.refetch}
                empty={a.rows.length === 0}
                emptyMessage={t('No users')}
              >
                <div className="rounded border border-border-subtle overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-2">
                        <th className={th}>{t('Username')}</th>
                        <th className={th}>{t('API Enabled')}</th>
                        <th className={th}>{t('Revoke Token')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.rows.map((row) => (
                        <tr key={row.user.id}>
                          <td className={td}>{row.user.username}</td>
                          <td className={td}>
                            <input
                              type="checkbox"
                              checked={row.apiEnabled}
                              disabled={!a.canEdit}
                              onChange={(e) => a.setApiEnabled(row.user.id, e.target.checked)}
                              aria-label={t('API enabled for {{name}}', { name: row.user.username })}
                            />
                          </td>
                          <td className={td}>
                            <input
                              type="checkbox"
                              checked={row.revoke}
                              disabled={!a.canEdit}
                              onChange={() => a.toggleRevoke(row.user.id)}
                              aria-label={t('Revoke tokens for {{name}}', { name: row.user.username })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </QueryState>
            )}
          </div>
        </RequirePerm>
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
