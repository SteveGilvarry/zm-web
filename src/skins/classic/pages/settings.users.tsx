import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useUsersPage } from '@/features/users/useUsersPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { UserEditor } from '@/skins/modern/components/settings/UserEditor';
import { OptionsRail } from '../components/settings/OptionsRail';
import {
  ClassicButton, ClassicSearch, ClassicTable, ClassicToolbar, classicLink, classicTd, classicTh,
} from '../components/settings/primitives';

/**
 * Options → Users — classic skin. Legacy `?view=options&tab=users`: mark
 * column, the permission columns as plain text, the signed-in user starred,
 * [Add New User] [Delete] on the start side and Export on the end.
 */
export default function ClassicSettingsUsersPage() {
  const { t } = useTranslation();
  const u = useUsersPage();
  const tabs = useOptionsTabs();
  useSiteTitle(t('Users'));

  if (!u.isAuthenticated) return null;

  const permCols = ['stream', 'events', 'control', 'monitors', 'groups', 'devices', 'snapshots', 'system'] as const;
  const permLabel: Record<(typeof permCols)[number], string> = {
    stream: t('Stream'), events: t('Events'), control: t('Control'), monitors: t('Monitors'),
    groups: t('Groups'), devices: t('Devices'), snapshots: t('Snapshots'), system: t('System'),
  };

  return (
    <AppShell title={t('Users')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="users" />
            <div className="flex-1 min-w-0 space-y-3">
              <RequirePerm feature="system" level="View" fallback="message">
                <ClassicToolbar
                  end={
                    <>
                      <ClassicSearch value={u.searchQuery} onChange={u.setSearchQuery} placeholder={t('Search')} />
                      <ClassicButton onClick={() => u.exportUsers('csv')}>{t('Export CSV')}</ClassicButton>
                      <ClassicButton onClick={() => u.exportUsers('json')}>{t('Export JSON')}</ClassicButton>
                    </>
                  }
                >
                  <RequirePerm feature="system" level="Edit">
                    <ClassicButton tone="primary" onClick={u.openCreate}>{t('Add New User')}</ClassicButton>
                    <ClassicButton
                      tone="danger"
                      disabled={u.selectedUsers.length === 0}
                      onClick={() => u.requestDelete(u.selectedUsers)}
                    >
                      {t('Delete')}
                    </ClassicButton>
                  </RequirePerm>
                </ClassicToolbar>

                <QueryState
                  isLoading={u.isLoading}
                  isError={u.isError}
                  error={u.error}
                  onRetry={u.refetch}
                  empty={u.filteredUsers.length === 0}
                  emptyMessage={t('No matching records found')}
                >
                  <ClassicTable>
                    <thead>
                      <tr>
                        {u.canEdit && (
                          <th className={clsx(classicTh, 'w-8')}>
                            <input
                              type="checkbox"
                              aria-label={t('Select all')}
                              checked={u.filteredUsers.filter((x) => !u.isCurrentUser(x)).every((x) => u.selectedIds.has(x.id)) && u.filteredUsers.some((x) => !u.isCurrentUser(x))}
                              onChange={u.toggleAll}
                            />
                          </th>
                        )}
                        <th className={classicTh}>{t('Username')}</th>
                        <th className={classicTh}>{t('Name')}</th>
                        <th className={classicTh}>{t('Email')}</th>
                        <th className={classicTh}>{t('Enabled')}</th>
                        {permCols.map((k) => <th key={k} className={classicTh}>{permLabel[k]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {u.filteredUsers.map((user) => {
                        const self = u.isCurrentUser(user);
                        const editable = u.canEditUser(user);
                        return (
                          <tr key={user.id}>
                            {u.canEdit && (
                              <td className={classicTd}>
                                <input
                                  type="checkbox"
                                  aria-label={t('Mark {{name}}', { name: user.username })}
                                  checked={u.selectedIds.has(user.id)}
                                  disabled={self}
                                  onChange={() => u.toggleSelected(user.id)}
                                />
                              </td>
                            )}
                            <td className={classicTd}>
                              {editable ? (
                                <button type="button" onClick={() => u.openEdit(user)} className={classicLink}>
                                  {user.username}
                                </button>
                              ) : user.username}
                              {self && <span title={t('You')} className="ms-0.5">*</span>}
                            </td>
                            <td className={classicTd}>{user.name}</td>
                            <td className={clsx(classicTd, 'font-mono text-xs')}>{user.email}</td>
                            <td className={classicTd}>
                              {u.canEdit && !self ? (
                                <input
                                  type="checkbox"
                                  checked={user.enabled === 1}
                                  onChange={() => u.toggleEnabled(user)}
                                  aria-label={user.enabled === 1 ? t('Disable {{name}}', { name: user.username }) : t('Enable {{name}}', { name: user.username })}
                                />
                              ) : (user.enabled === 1 ? t('Yes') : t('No'))}
                            </td>
                            {permCols.map((k) => <td key={k} className={clsx(classicTd, 'text-xs')}>{user[k]}</td>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </ClassicTable>
                </QueryState>

                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>{t('Showing {{count}} of {{total}} rows', { count: u.filteredUsers.length, total: u.matchingCount })}</span>
                  {u.totalPages > 1 && (
                    <span className="flex items-center gap-2">
                      <ClassicButton onClick={u.prevPage} disabled={u.page === 1}>{t('Prev')}</ClassicButton>
                      <span>{t('Page {{page}} of {{total}}', { page: u.page, total: u.totalPages })}</span>
                      <ClassicButton onClick={u.nextPage} disabled={u.page === u.totalPages}>{t('Next')}</ClassicButton>
                    </span>
                  )}
                </div>
              </RequirePerm>
            </div>
          </div>
        </div>
      </main>

      {u.editorOpen && (
        <UserEditor key={u.editingUser?.id ?? 'new'} editing={u.editingUser} mode={u.editorMode} onClose={u.closeEditor} />
      )}

      <ConfirmDialog
        isOpen={u.deleteTargets.length > 0}
        onClose={u.clearDelete}
        onConfirm={u.confirmDelete}
        title={t('Delete User')}
        message={
          u.deleteTargets.length === 1
            ? t('Are you sure you want to delete user "{{name}}"? This cannot be undone.', { name: u.deleteTargets[0]?.username })
            : t('Delete {{count}} user? This cannot be undone.', { count: u.deleteTargets.length })
        }
        confirmText={t('Delete')}
        variant="danger"
        isLoading={u.isDeleting}
      />
    </AppShell>
  );
}
