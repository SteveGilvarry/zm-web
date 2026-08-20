import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useUsersPage } from '@/features/users/useUsersPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { UserEditor } from '@/skins/modern/components/settings/UserEditor';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { OptionsRail } from '../components/settings/OptionsRail';

/** Options → Users — classic skin: the legacy user table, plain permission text. */
export default function ClassicSettingsUsersPage() {
  const { t } = useTranslation();
  const u = useUsersPage();
  const tabs = useOptionsTabs();
  useDocumentTitle(t('Users'));

  if (!u.isAuthenticated) return null;

  const btn = 'px-2 py-0.5 text-xs border border-zinc-500 rounded-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40';

  return (
    <AppShell title={t('Users')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="users" />
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="search"
                  value={u.searchQuery}
                  onChange={(e) => u.setSearchQuery(e.target.value)}
                  placeholder={t('Search users...')}
                  className="w-72 px-2 py-1 text-sm bg-white border border-zinc-400 rounded-sm text-zinc-900 focus:outline-none focus:border-zinc-600"
                />
                <button type="button" onClick={u.openCreate} className={btn}>{t('Add User')}</button>
                <span className="ms-auto text-xs text-zinc-500">{t('{{count}} total', { count: u.total })}</span>
              </div>

              <div className="bg-white rounded border border-zinc-300 overflow-hidden">
                {u.isLoading ? (
                  <div className="p-8 text-center text-zinc-500 text-sm">{t('Loading users...')}</div>
                ) : u.filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-sm">{t('No users found')}</div>
                ) : (
                  <table className="w-full text-sm text-zinc-800">
                    <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-start font-semibold">{t('Username')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Name')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Email')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Enabled')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Stream')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Events')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Control')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Monitors')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Groups')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Devices')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('Snapshots')}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t('System')}</th>
                        <th className="px-3 py-2 text-end font-semibold">{t('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {u.filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-zinc-200 hover:bg-zinc-50">
                          <td className="px-3 py-1.5">
                            <button
                              type="button"
                              onClick={() => u.openEdit(user)}
                              className="text-cyan-800 hover:underline"
                            >
                              {user.username}
                            </button>
                            {u.isCurrentUser(user) && (
                              <span className="ms-1 text-[10px] text-zinc-500">({t('You')})</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">{user.name}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{user.email}</td>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={user.enabled === 1}
                              onChange={() => u.toggleEnabled(user)}
                              aria-label={user.enabled === 1 ? t('Disable {{name}}', { name: user.username }) : t('Enable {{name}}', { name: user.username })}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-xs">{user.stream}</td>
                          <td className="px-3 py-1.5 text-xs">{user.events}</td>
                          <td className="px-3 py-1.5 text-xs">{user.control}</td>
                          <td className="px-3 py-1.5 text-xs">{user.monitors}</td>
                          <td className="px-3 py-1.5 text-xs">{user.groups}</td>
                          <td className="px-3 py-1.5 text-xs">{user.devices}</td>
                          <td className="px-3 py-1.5 text-xs">{user.snapshots}</td>
                          <td className="px-3 py-1.5 text-xs">{user.system}</td>
                          <td className="px-3 py-1.5 text-end whitespace-nowrap">
                            <button type="button" onClick={() => u.openEdit(user)} className={btn}>{t('Edit')}</button>{' '}
                            <button
                              type="button"
                              onClick={() => u.setDeleteTarget(user)}
                              disabled={u.isCurrentUser(user)}
                              title={u.isCurrentUser(user) ? t('Cannot delete yourself') : undefined}
                              className={btn}
                            >
                              {t('Delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {u.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>{t('Page {{page}} of {{total}} ({{count}} total)', { page: u.page, total: u.totalPages, count: u.total })}</span>
                  <span className="flex items-center gap-2">
                    <button onClick={u.prevPage} disabled={u.page === 1} className={btn}>{t('Prev')}</button>
                    <button onClick={u.nextPage} disabled={u.page === u.totalPages} className={btn}>{t('Next')}</button>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {u.editorOpen && <UserEditor key={u.editingUser?.id ?? 'new'} editing={u.editingUser} onClose={u.closeEditor} />}

      <ConfirmDialog
        isOpen={!!u.deleteTarget}
        onClose={() => u.setDeleteTarget(null)}
        onConfirm={u.confirmDelete}
        title={t('Delete User')}
        message={t('Are you sure you want to delete user "{{name}}"? This cannot be undone.', { name: u.deleteTarget?.username })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={u.isDeleting}
      />
    </AppShell>
  );
}
