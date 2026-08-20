import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Users,
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
import { Panel } from '@/components/common/Panel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { useUsersPage } from '@/features/users/useUsersPage';
import { PermPill } from '../components/settings/PermPill';
import { UserEditor } from '../components/settings/UserEditor';

/** Settings → Users — Mission Control. */
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
          <Panel title={t('User Accounts')} icon={<Users size={18} />} noPadding>
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle flex-wrap">
              <div className="relative flex-1 min-w-[12rem] max-w-sm">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="search"
                  placeholder={t('Search users...')}
                  value={u.searchQuery}
                  onChange={(e) => u.setSearchQuery(e.target.value)}
                  aria-label={t('Search users')}
                  className={clsx(
                    'w-full ps-10 pe-4 py-2',
                    'bg-panel border border-border-subtle rounded-lg',
                    'text-text-primary text-sm placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors',
                  )}
                />
              </div>
              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => u.exportUsers('csv')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Download size={13} />
                  {t('Export CSV')}
                </button>
                <button
                  type="button"
                  onClick={() => u.exportUsers('json')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Download size={13} />
                  {t('Export JSON')}
                </button>
                <RequirePerm feature="system" level="Edit">
                  <button
                    type="button"
                    onClick={() => u.requestDelete(u.selectedUsers)}
                    disabled={u.selectedUsers.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-crimson/40 text-crimson hover:bg-crimson/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                    {t('Delete selected ({{count}})', { count: u.selectedUsers.length })}
                  </button>
                  <button
                    type="button"
                    onClick={u.openCreate}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2 rounded-lg',
                      'bg-cyan text-void text-sm font-medium',
                      'hover:bg-cyan/80 transition-colors',
                    )}
                  >
                    <Plus size={16} />
                    {t('Add User')}
                  </button>
                </RequirePerm>
              </div>
            </div>

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
                    <tr className="border-b border-border-subtle text-start">
                      {u.canEdit && (
                        <th className="px-3 py-3 w-8">
                          <input
                            type="checkbox"
                            aria-label={t('Select all')}
                            checked={filteredUsers.filter((x) => !u.isCurrentUser(x)).every((x) => u.selectedIds.has(x.id)) && filteredUsers.some((x) => !u.isCurrentUser(x))}
                            onChange={u.toggleAll}
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Username')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Name')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Email')}</th>
                      <th className="px-4 py-3 font-medium text-text-muted">{t('Enabled')}</th>
                      {permCols.map(([key, label]) => (
                        <th key={key} className="px-3 py-3 font-medium text-text-muted">{label}</th>
                      ))}
                      <th className="px-4 py-3 font-medium text-text-muted text-end">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredUsers.map((user) => {
                      const self = u.isCurrentUser(user);
                      const editable = u.canEditUser(user);
                      return (
                        <tr key={user.id} className="hover:bg-panel/50 transition-colors">
                          {u.canEdit && (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                aria-label={t('Mark {{name}}', { name: user.username })}
                                checked={u.selectedIds.has(user.id)}
                                disabled={self}
                                onChange={() => u.toggleSelected(user.id)}
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-cyan/20 flex items-center justify-center">
                                <span className="text-cyan text-xs font-medium">
                                  {user.username.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              {editable ? (
                                <button type="button" onClick={() => u.openEdit(user)} className="font-medium text-text-primary hover:text-cyan hover:underline">
                                  {user.username}
                                </button>
                              ) : (
                                <span className="font-medium text-text-primary">{user.username}</span>
                              )}
                              {self && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan/20 text-cyan font-medium">
                                  {t('You')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{user.name}</td>
                          <td className="px-4 py-3 text-text-muted text-xs font-mono">{user.email}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => u.toggleEnabled(user)}
                              role="switch"
                              aria-checked={user.enabled === 1}
                              disabled={!u.canEdit || self}
                              aria-label={user.enabled === 1 ? t('Disable {{name}}', { name: user.username }) : t('Enable {{name}}', { name: user.username })}
                              className={clsx(
                                'relative w-10 h-5 rounded-full transition-colors',
                                user.enabled === 1 ? 'bg-cyan' : 'bg-border',
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
                            <td key={key} className="px-3 py-3"><PermPill value={user[key]} /></td>
                          ))}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {editable && (
                                <button
                                  onClick={() => u.openEdit(user)}
                                  className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
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
                                    className="p-1.5 rounded text-text-dim cursor-not-allowed"
                                    title={t('Cannot delete yourself')}
                                    aria-label={t('Delete {{name}}', { name: user.username })}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => u.requestDelete(user)}
                                    className="p-1.5 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
                <span className="text-xs text-text-muted">
                  {t('Page {{page}} of {{total}} ({{count}} total)', { page, total: totalPages, count: u.matchingCount })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={u.prevPage}
                    disabled={page === 1}
                    aria-label={t('Previous page')}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === 1
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50',
                    )}
                  >
                    <ChevronLeft size={14} className="rtl:-scale-x-100" />
                  </button>
                  <button
                    onClick={u.nextPage}
                    disabled={page === totalPages}
                    aria-label={t('Next page')}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === totalPages
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50',
                    )}
                  >
                    <ChevronRight size={14} className="rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </RequirePerm>
      </main>

      {/* Editor — keyed so the tab resets on open / user switch */}
      {u.editorOpen && (
        <UserEditor
          key={u.editingUser?.id ?? 'new'}
          editing={u.editingUser}
          mode={u.editorMode}
          onClose={u.closeEditor}
        />
      )}
      {u.editorLoading && (
        <Modal isOpen onClose={u.closeEditor} title={t('Edit user')}>
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
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
