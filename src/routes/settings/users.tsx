import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getUsers, createUser, updateUser, deleteUser } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';

export const Route = createFileRoute('/settings/users')({
  component: UsersPage,
});

const permissionLevels = ['None', 'View', 'Edit'];

const permissionColors: Record<string, string> = {
  Edit: 'bg-amber/20 text-amber',
  View: 'bg-cyan/20 text-cyan',
  None: 'bg-panel text-text-muted',
};

function UsersPage() {
  const { isAuthenticated, user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 25;

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users', page, pageSize],
    queryFn: () => getUsers({ page, page_size: pageSize }),
    enabled: isAuthenticated,
  });

  const users = usersData?.items || [];
  const totalPages = usersData?.last_page || 1;

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    enabled: 1,
    system: 'None',
  });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const openCreate = () => {
    setEditingUser(null);
    setFormData({ username: '', password: '', name: '', email: '', enabled: 1, system: 'None' });
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      email: user.email,
      enabled: user.enabled,
      system: user.system,
    });
    setModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, data),
    onSuccess: () => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) =>
      updateUser(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const handleSubmit = () => {
    if (editingUser) {
      const data: Parameters<typeof updateUser>[1] = {
        name: formData.name,
        email: formData.email,
        enabled: formData.enabled,
        system: formData.system,
      };
      if (formData.password) {
        data.password = formData.password;
      }
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        enabled: formData.enabled,
        system: formData.system,
      });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Prevent deleting yourself
  const isCurrentUser = (u: User) => currentUser?.user === u.username;

  if (!isAuthenticated) return null;

  return (
    <AppShell title="User Management">
      <main className="flex-1 p-6 overflow-auto">
          <Panel
            title="User Accounts"
            icon={<Users size={18} />}
            noPadding
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={clsx(
                    'w-full pl-10 pr-4 py-2',
                    'bg-panel border border-border-subtle rounded-lg',
                    'text-text-primary text-sm placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors'
                  )}
                />
              </div>
              <button
                onClick={openCreate}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-cyan text-void text-sm font-medium',
                  'hover:bg-cyan/80 transition-colors'
                )}
              >
                <Plus size={16} />
                Add User
              </button>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="p-8 text-center text-text-muted text-sm">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-sm">
                <Users size={32} className="mx-auto mb-3 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left">
                      <th className="px-4 py-3 font-medium text-text-muted">Username</th>
                      <th className="px-4 py-3 font-medium text-text-muted">Name</th>
                      <th className="px-4 py-3 font-medium text-text-muted">Email</th>
                      <th className="px-4 py-3 font-medium text-text-muted">Role</th>
                      <th className="px-4 py-3 font-medium text-text-muted">Enabled</th>
                      <th className="px-4 py-3 font-medium text-text-muted text-right">Actions</th>
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
                            {isCurrentUser(user) && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan/20 text-cyan font-medium">
                                You
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{user.name}</td>
                        <td className="px-4 py-3 text-text-muted text-xs font-mono">{user.email}</td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              'text-xs font-medium px-2 py-0.5 rounded',
                              permissionColors[user.system] || permissionColors.None
                            )}
                          >
                            {user.system}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              toggleEnabled.mutate({
                                id: user.id,
                                enabled: user.enabled === 1 ? 0 : 1,
                              })
                            }
                            className={clsx(
                              'relative w-10 h-5 rounded-full transition-colors',
                              user.enabled === 1 ? 'bg-cyan' : 'bg-border'
                            )}
                          >
                            <span
                              className={clsx(
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                user.enabled === 1 ? 'left-5.5' : 'left-0.5'
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(user)}
                              className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            {isCurrentUser(user) ? (
                              <button
                                disabled
                                className="p-1.5 rounded text-text-dim cursor-not-allowed"
                                title="Cannot delete yourself"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => setDeleteTarget(user)}
                                className="p-1.5 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                                title="Delete"
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
                  Page {page} of {totalPages} ({usersData?.total || 0} total)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === 1
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50'
                    )}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-colors',
                      page === totalPages
                        ? 'border-border-subtle text-text-muted cursor-not-allowed'
                        : 'border-border-subtle text-text-primary hover:border-cyan/50'
                    )}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </Panel>
      </main>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Add User'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData((f) => ({ ...f, username: e.target.value }))}
              disabled={!!editingUser}
              className={clsx(
                'w-full px-3 py-2',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors',
                editingUser && 'opacity-60 cursor-not-allowed'
              )}
              placeholder="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Password{editingUser && ' (leave blank to keep current)'}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
              className={clsx(
                'w-full px-3 py-2',
                'bg-panel border border-border-subtle rounded-lg',
                'text-text-primary text-sm',
                'focus:outline-none focus:border-cyan/50',
                'transition-colors'
              )}
              placeholder={editingUser ? 'Leave blank to keep current' : 'Password'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                className={clsx(
                  'w-full px-3 py-2',
                  'bg-panel border border-border-subtle rounded-lg',
                  'text-text-primary text-sm',
                  'focus:outline-none focus:border-cyan/50',
                  'transition-colors'
                )}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                className={clsx(
                  'w-full px-3 py-2',
                  'bg-panel border border-border-subtle rounded-lg',
                  'text-text-primary text-sm',
                  'focus:outline-none focus:border-cyan/50',
                  'transition-colors'
                )}
                placeholder="user@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                System Permission
              </label>
              <select
                value={formData.system}
                onChange={(e) => setFormData((f) => ({ ...f, system: e.target.value }))}
                className={clsx(
                  'w-full px-3 py-2 appearance-none',
                  'bg-panel border border-border-subtle rounded-lg',
                  'text-text-primary text-sm',
                  'focus:outline-none focus:border-cyan/50',
                  'transition-colors cursor-pointer'
                )}
              >
                {permissionLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="flex items-center justify-between w-full pb-2">
                <label className="text-sm font-medium text-text-secondary">Enabled</label>
                <button
                  onClick={() => setFormData((f) => ({ ...f, enabled: f.enabled === 1 ? 0 : 1 }))}
                  className={clsx(
                    'relative w-10 h-5 rounded-full transition-colors',
                    formData.enabled === 1 ? 'bg-cyan' : 'bg-border'
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                      formData.enabled === 1 ? 'left-5.5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-panel border border-border-subtle',
                'text-text-secondary hover:text-text-primary',
                'transition-colors'
              )}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                isSaving ||
                !formData.username ||
                (!editingUser && !formData.password)
              }
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-cyan text-void',
                'hover:bg-cyan/80 transition-colors',
                'flex items-center gap-2',
                (isSaving || !formData.username || (!editingUser && !formData.password)) &&
                  'opacity-50 cursor-not-allowed'
              )}
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {editingUser ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete User"
        message={`Are you sure you want to delete user "${deleteTarget?.username}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </AppShell>
  );
}
