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
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useUsersPage } from '@/features/users/useUsersPage';
import { PermPill } from '../components/settings/PermPill';
import { UserEditor } from '../components/settings/UserEditor';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Settings → Users — Mission Control. */
export default function SettingsUsersPage() {
  const { t } = useTranslation();
  const u = useUsersPage();
  useDocumentTitle(t('Users'));
  const { filteredUsers, page, totalPages, deleteTarget } = u;

  if (!u.isAuthenticated) return null;

  return (
    <AppShell title={t('User Management')}>
      <main className="flex-1 p-6 overflow-auto">
        <Panel title={t('User Accounts')} icon={<Users size={18} />} noPadding>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder={t('Search users...')}
                value={u.searchQuery}
                onChange={(e) => u.setSearchQuery(e.target.value)}
                className={clsx(
                  'w-full ps-10 pe-4 py-2',
                  'bg-panel border border-border-subtle rounded-lg',
                  'text-text-primary text-sm placeholder:text-text-muted',
                  'focus:outline-none focus:border-cyan/50',
                  'transition-colors',
                )}
              />
            </div>
            <button
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
          </div>

          {/* Table */}
          {u.isLoading ? (
            <div className="p-8 text-center text-text-muted text-sm">{t('Loading users...')}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm">
              <Users size={32} className="mx-auto mb-3 opacity-50" />
              <p>{t('No users found')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-start">
                    <th className="px-4 py-3 font-medium text-text-muted">{t('Username')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t('Name')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t('Email')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t('Stream')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t('Events')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t('Monitors')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t('System')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t('Enabled')}</th>
                    <th className="px-4 py-3 font-medium text-text-muted text-end">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-panel/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-cyan/20 flex items-center justify-center">
                            <span className="text-cyan text-xs font-medium">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-text-primary">{user.username}</span>
                          {u.isCurrentUser(user) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan/20 text-cyan font-medium">
                              {t('You')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{user.name}</td>
                      <td className="px-4 py-3 text-text-muted text-xs font-mono">{user.email}</td>
                      <td className="px-4 py-3"><PermPill value={user.stream} /></td>
                      <td className="px-4 py-3"><PermPill value={user.events} /></td>
                      <td className="px-4 py-3"><PermPill value={user.monitors} /></td>
                      <td className="px-4 py-3"><PermPill value={user.system} /></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => u.toggleEnabled(user)}
                          role="switch"
                          aria-checked={user.enabled === 1}
                          aria-label={user.enabled === 1 ? t('Disable {{name}}', { name: user.username }) : t('Enable {{name}}', { name: user.username })}
                          className={clsx(
                            'relative w-10 h-5 rounded-full transition-colors',
                            user.enabled === 1 ? 'bg-cyan' : 'bg-border',
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => u.openEdit(user)}
                            className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                            title={t('Edit')}
                            aria-label={t('Edit {{name}}', { name: user.username })}
                          >
                            <Pencil size={14} />
                          </button>
                          {u.isCurrentUser(user) ? (
                            <button
                              disabled
                              className="p-1.5 rounded text-text-dim cursor-not-allowed"
                              title={t('Cannot delete yourself')}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => u.setDeleteTarget(user)}
                              className="p-1.5 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                              title={t('Delete')}
                              aria-label={t('Delete {{name}}', { name: user.username })}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
              <span className="text-xs text-text-muted">
                {t('Page {{page}} of {{total}} ({{count}} total)', { page, total: totalPages, count: u.total })}
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
      </main>

      {/* Editor — keyed so the tab resets on open / user switch */}
      {u.editorOpen && (
        <UserEditor
          key={u.editingUser?.id ?? 'new'}
          editing={u.editingUser}
          onClose={u.closeEditor}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => u.setDeleteTarget(null)}
        onConfirm={u.confirmDelete}
        title={t('Delete User')}
        message={t('Are you sure you want to delete user "{{name}}"? This cannot be undone.', { name: deleteTarget?.username })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={u.isDeleting}
      />
    </AppShell>
  );
}
