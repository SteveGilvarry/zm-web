import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { useUsersPage } from '@/features/users/useUsersPage';
import { PermPill } from '../components/settings/PermPill';
import { UserEditor } from '../components/settings/UserEditor';

const th = 'px-4 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const iconBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors';
const pagerBtn = 'p-1.5 rounded border border-border-subtle transition-colors';

/**
 * Settings → Users — the modern skin.
 *
 * One heading, one toolbar, one bordered table. The permission columns
 * carry the only colour on the page: a level is state (docs/DESIGN.md).
 */
export default function SettingsUsersPage() {
  const { t } = useTranslation();
  const u = useUsersPage();
  useSiteTitle(t('Users'));
  const { filteredUsers, page, totalPages } = u;

  if (!u.isAuthenticated) return null;

  const permCols: ReadonlyArray<readonly ['stream' | 'events' | 'control' | 'monitors' | 'groups' | 'devices' | 'snapshots' | 'system', string]> = [
    ['stream', t('Stream')],
    ['events', t('Events')],
    ['control', t('Control')],
    ['monitors', t('Monitors')],
    ['groups', t('Groups')],
    ['devices', t('Devices')],
    ['snapshots', t('Snapshots')],
    ['system', t('System')],
  ];

  return (
    <AppShell title={t('User Management')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="View" fallback="message">
          <div className="mx-auto w-full max-w-[1400px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-fg">{t('User Accounts')}</h2>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" aria-hidden />
                  <input
                    type="search"
                    placeholder={t('Search users...')}
                    value={u.searchQuery}
                    onChange={(e) => u.setSearchQuery(e.target.value)}
                    aria-label={t('Search users')}
                    className={clsx(fieldClasses('sm'), 'ps-8')}
                  />
                </div>
                <Button size="sm" variant="ghost" onClick={() => u.exportUsers('csv')}>
                  <Download size={13} aria-hidden />
                  {t('Export CSV')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => u.exportUsers('json')}>
                  <Download size={13} aria-hidden />
                  {t('Export JSON')}
                </Button>
                <RequirePerm feature="system" level="Edit">
                  <button
                    type="button"
                    onClick={() => u.requestDelete(u.selectedUsers)}
                    disabled={u.selectedUsers.length === 0}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-danger/40 text-label font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} aria-hidden />
                    {t('Delete selected ({{count}})', { count: u.selectedUsers.length })}
                  </button>
                  <Button size="sm" variant="primary" onClick={u.openCreate}>
                    <Plus size={14} aria-hidden />
                    {t('Add User')}
                  </Button>
                </RequirePerm>
              </div>
            </div>

            <div className="rounded border border-border-subtle overflow-hidden">
              <QueryState
                isLoading={u.isLoading}
                isError={u.isError}
                error={u.error}
                onRetry={u.refetch}
                empty={filteredUsers.length === 0}
                emptyMessage={u.searchQuery ? t('No users match your search') : t('No users found')}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        {u.canEdit && (
                          <th className="px-3 py-2 w-8">
                            <input
                              type="checkbox"
                              aria-label={t('Select all')}
                              checked={filteredUsers.filter((x) => !u.isCurrentUser(x)).every((x) => u.selectedIds.has(x.id)) && filteredUsers.some((x) => !u.isCurrentUser(x))}
                              onChange={u.toggleAll}
                            />
                          </th>
                        )}
                        <th className={th}>{t('Username')}</th>
                        <th className={th}>{t('Name')}</th>
                        <th className={th}>{t('Email')}</th>
                        <th className={th}>{t('Enabled')}</th>
                        {permCols.map(([key, label]) => (
                          <th key={key} className={clsx(th, 'px-3')}>{label}</th>
                        ))}
                        <th className={clsx(th, 'text-end')}>{t('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {filteredUsers.map((user) => {
                        const self = u.isCurrentUser(user);
                        const editable = u.canEditUser(user);
                        return (
                          <tr key={user.id} className="hover:bg-surface-2 transition-colors">
                            {u.canEdit && (
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  aria-label={t('Mark {{name}}', { name: user.username })}
                                  checked={u.selectedIds.has(user.id)}
                                  disabled={self}
                                  onChange={() => u.toggleSelected(user.id)}
                                />
                              </td>
                            )}
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                {editable ? (
                                  <button type="button" onClick={() => u.openEdit(user)} className="font-medium text-fg hover:text-accent hover:underline">
                                    {user.username}
                                  </button>
                                ) : (
                                  <span className="font-medium text-fg">{user.username}</span>
                                )}
                                {self && (
                                  <span className="text-xs text-fg-dim">{t('You')}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-fg-muted">{user.name}</td>
                            <td className="px-4 py-2 font-mono text-xs text-fg-muted">{user.email}</td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() => u.toggleEnabled(user)}
                                role="switch"
                                aria-checked={user.enabled === 1}
                                disabled={!u.canEdit || self}
                                aria-label={user.enabled === 1 ? t('Disable {{name}}', { name: user.username }) : t('Enable {{name}}', { name: user.username })}
                                className={clsx(
                                  'relative w-10 h-5 rounded-full transition-colors',
                                  user.enabled === 1 ? 'bg-accent' : 'bg-border',
                                  (!u.canEdit || self) && 'opacity-60 cursor-not-allowed',
                                )}
                              >
                                <span
                                  className={clsx(
                                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                    user.enabled === 1 ? 'start-5.5' : 'start-0.5',
                                  )}
                                />
                              </button>
                            </td>
                            {permCols.map(([key]) => (
                              <td key={key} className="px-3 py-2"><PermPill value={user[key]} /></td>
                            ))}
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-end gap-1">
                                {editable && (
                                  <button
                                    onClick={() => u.openEdit(user)}
                                    className={iconBtn}
                                    title={t('Edit')}
                                    aria-label={t('Edit {{name}}', { name: user.username })}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                <RequirePerm feature="system" level="Edit">
                                  {self ? (
                                    <button
                                      disabled
                                      className="p-1.5 rounded text-fg-faint cursor-not-allowed"
                                      title={t('Cannot delete yourself')}
                                      aria-label={t('Delete {{name}}', { name: user.username })}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => u.requestDelete(user)}
                                      className="p-1.5 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
                                      title={t('Delete')}
                                      aria-label={t('Delete {{name}}', { name: user.username })}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </RequirePerm>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </QueryState>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle">
                  <span className="text-xs text-fg-dim tabular-nums">
                    {t('Page {{page}} of {{total}} ({{count}} total)', { page, total: totalPages, count: u.matchingCount })}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={u.prevPage}
                      disabled={page === 1}
                      aria-label={t('Previous page')}
                      className={clsx(pagerBtn, page === 1 ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-border')}
                    >
                      <ChevronLeft size={14} className="rtl:-scale-x-100" />
                    </button>
                    <button
                      onClick={u.nextPage}
                      disabled={page === totalPages}
                      aria-label={t('Next page')}
                      className={clsx(pagerBtn, page === totalPages ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-border')}
                    >
                      <ChevronRight size={14} className="rtl:-scale-x-100" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </RequirePerm>
      </main>

      <ChangePasswordDialog isOpen={u.passwordOpen} onClose={u.closePasswordChange} />

      {/* Editor — keyed so the tab resets on open / user switch */}
      {u.editorOpen && (
        <UserEditor
          key={u.editingUser?.id ?? 'new'}
          editing={u.editingUser}
          mode={u.editorMode}
          onClose={u.closeEditor}
          onChangePassword={u.editingSelf ? u.openPasswordChange : undefined}
        />
      )}
      {u.editorLoading && (
        <Modal isOpen onClose={u.closeEditor} title={t('Edit user')}>
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-fg-dim">
            <Loader2 size={14} className="animate-spin" /> {t('Loading…')}
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
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
