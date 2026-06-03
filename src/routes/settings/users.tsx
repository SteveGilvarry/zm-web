import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useRef, useEffect } from 'react';
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
  Shield,
  Info,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getUsers, createUser, updateUser, deleteUser } from '@/api/users';
import { listGroups, listGroupMonitors } from '@/api/groups';
import { getMonitors } from '@/api/monitors';
import {
  listGroupsPermissions,
  createGroupPermission,
  updateGroupPermission,
  deleteGroupPermission,
  type GroupPermission,
} from '@/api/groupsPermissions';
import {
  listMonitorsPermissions,
  createMonitorPermission,
  updateMonitorPermission,
  deleteMonitorPermission,
  type MonitorPermission,
} from '@/api/monitorsPermissions';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import {
  PermissionMatrix,
  buildTopLevelRows,
  computeEffectivePermission,
  INHERIT_LEVEL_OPTIONS,
} from '@/features/users/PermissionMatrix';

export const Route = createFileRoute('/settings/users')({
  component: UsersPage,
});

const permissionColors: Record<string, string> = {
  Edit: 'bg-amber/20 text-amber',
  View: 'bg-cyan/20 text-cyan',
  Create: 'bg-emerald/20 text-emerald',
  None: 'bg-panel text-text-muted',
};

function permPill(value: string) {
  const v = value || 'None';
  return (
    <span
      className={clsx(
        'text-xs font-medium px-2 py-0.5 rounded',
        permissionColors[v] || permissionColors.None,
      )}
    >
      {v}
    </span>
  );
}

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

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const openCreate = () => {
    setEditingUser(null);
    setEditorOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditorOpen(true);
  };

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) =>
      updateUser(id, { enabled }),
    onSuccess: () => {
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

  // Prevent deleting yourself
  const isCurrentUser = (u: User) => currentUser?.user === u.username;

  if (!isAuthenticated) return null;

  return (
    <AppShell title="User Management">
      <main className="flex-1 p-6 overflow-auto">
        <Panel title="User Accounts" icon={<Users size={18} />} noPadding>
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
                  'transition-colors',
                )}
              />
            </div>
            <button
              onClick={openCreate}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-cyan text-void text-sm font-medium',
                'hover:bg-cyan/80 transition-colors',
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
                    <th className="px-4 py-3 font-medium text-text-muted">Stream</th>
                    <th className="px-4 py-3 font-medium text-text-muted">Events</th>
                    <th className="px-4 py-3 font-medium text-text-muted">Monitors</th>
                    <th className="px-4 py-3 font-medium text-text-muted">System</th>
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
                      <td className="px-4 py-3">{permPill(user.stream)}</td>
                      <td className="px-4 py-3">{permPill(user.events)}</td>
                      <td className="px-4 py-3">{permPill(user.monitors)}</td>
                      <td className="px-4 py-3">{permPill(user.system)}</td>
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
                            user.enabled === 1 ? 'bg-cyan' : 'bg-border',
                          )}
                        >
                          <span
                            className={clsx(
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                              user.enabled === 1 ? 'left-5.5' : 'left-0.5',
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
                      : 'border-border-subtle text-text-primary hover:border-cyan/50',
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
                      : 'border-border-subtle text-text-primary hover:border-cyan/50',
                  )}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </Panel>
      </main>

      {/* Editor */}
      <UserEditor
        open={editorOpen}
        editing={editingUser}
        onClose={() => setEditorOpen(false)}
      />

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

/* ------------------------------------------------------------------------ */
/*  Editor                                                                   */
/* ------------------------------------------------------------------------ */

type EditorTab = 'account' | 'global' | 'groups' | 'monitors';

interface UserEditorProps {
  open: boolean;
  editing: User | null;
  onClose: () => void;
}

function UserEditor({ open, editing, onClose }: UserEditorProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<EditorTab>('account');

  // Reset tab whenever the dialog opens for a different user.
  useEffect(() => {
    if (open) setTab('account');
  }, [open, editing?.id]);

  if (!open) return null;

  return (
    <Modal isOpen={open} onClose={onClose} title={editing ? `Edit ${editing.username}` : 'Add User'}>
      <div className="-mx-5 -my-5">
        {/* Tabs (only meaningful when editing — create form is account-only). */}
        {editing && (
          <div className="flex items-center gap-1 px-5 pt-1 border-b border-border-subtle">
            {([
              ['account', 'Account'],
              ['global', 'Global Permissions'],
              ['groups', 'Groups'],
              ['monitors', 'Monitors'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={clsx(
                  'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                  tab === key
                    ? 'border-cyan text-cyan'
                    : 'border-transparent text-text-muted hover:text-text-primary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-5">
          {tab === 'account' && (
            <AccountForm
              editing={editing}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['users'] });
                onClose();
              }}
              onCancel={onClose}
            />
          )}
          {tab === 'global' && editing && <GlobalPermissionsView user={editing} />}
          {tab === 'groups' && editing && <GroupPermissionsTab userId={editing.id} />}
          {tab === 'monitors' && editing && <MonitorPermissionsTab user={editing} />}
        </div>
      </div>
    </Modal>
  );
}

/* ----- Account tab ------------------------------------------------------ */

interface AccountFormProps {
  editing: User | null;
  onSaved: () => void;
  onCancel: () => void;
}

function AccountForm({ editing, onSaved, onCancel }: AccountFormProps) {
  const [formData, setFormData] = useState({
    username: editing?.username || '',
    password: '',
    confirmPassword: '',
    name: editing?.name || '',
    email: editing?.email || '',
    phone: editing?.phone || '',
    enabled: editing?.enabled ?? 1,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, data),
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const submit = () => {
    setError(null);
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (editing) {
      const data: Parameters<typeof updateUser>[1] = {
        name: formData.name,
        email: formData.email,
        enabled: formData.enabled,
        phone: formData.phone,
      };
      if (formData.password) data.password = formData.password;
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        enabled: formData.enabled,
        phone: formData.phone || undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Username</label>
        <input
          type="text"
          value={formData.username}
          onChange={(e) => setFormData((f) => ({ ...f, username: e.target.value }))}
          disabled={!!editing}
          className={clsx(
            'w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg',
            'text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors',
            editing && 'opacity-60 cursor-not-allowed',
          )}
          placeholder="username"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Password{editing && ' (blank = keep)'}
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors"
            placeholder={editing ? 'Leave blank to keep current' : 'Password'}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Confirm Password
          </label>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData((f) => ({ ...f, confirmPassword: e.target.value }))}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors"
            placeholder="Confirm password"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Full Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors"
            placeholder="Full name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors"
            placeholder="user@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Phone</label>
          <input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors"
            placeholder="Phone"
          />
        </div>
        <div className="flex items-end">
          <div className="flex items-center justify-between w-full pb-2">
            <label className="text-sm font-medium text-text-secondary">Enabled</label>
            <button
              onClick={() => setFormData((f) => ({ ...f, enabled: f.enabled === 1 ? 0 : 1 }))}
              className={clsx(
                'relative w-10 h-5 rounded-full transition-colors',
                formData.enabled === 1 ? 'bg-cyan' : 'bg-border',
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  formData.enabled === 1 ? 'left-5.5' : 'left-0.5',
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs text-crimson bg-crimson/10 border border-crimson/20 rounded p-2">
          {error}
        </div>
      )}

      {!editing && (
        <p className="text-[11px] text-text-muted leading-relaxed">
          New users are created with default permissions. After saving, re-open the user to
          set Global / Group / Monitor permissions.
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-panel border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={
            isSaving ||
            !formData.username ||
            (!editing && !formData.password)
          }
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium bg-cyan text-void hover:bg-cyan/80 transition-colors flex items-center gap-2',
            (isSaving || !formData.username || (!editing && !formData.password)) &&
              'opacity-50 cursor-not-allowed',
          )}
        >
          {isSaving && <Loader2 size={14} className="animate-spin" />}
          {editing ? 'Save Changes' : 'Create User'}
        </button>
      </div>
    </div>
  );
}

/* ----- Global permissions (read-only) ----------------------------------- */

function GlobalPermissionsView({ user }: { user: User }) {
  const rows = useMemo(() => buildTopLevelRows(user), [user]);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-text-muted bg-panel border border-border-subtle rounded p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-cyan" />
        <p className="leading-relaxed">
          Top-level permissions are <strong>read-only</strong> here — the backend
          (<code>CreateUserRequest</code> / <code>UpdateUserRequest</code>) does not yet accept
          these fields. Use the <em>Groups</em> and <em>Monitors</em> tabs for per-resource
          overrides, which persist via the dedicated permission endpoints.
        </p>
      </div>
      <PermissionMatrix rows={rows} readOnly />
    </div>
  );
}

/* ----- Group permissions tab -------------------------------------------- */

function GroupPermissionsTab({ userId }: { userId: number }) {
  const queryClient = useQueryClient();

  const groupsQ = useQuery({
    queryKey: ['groups', 'for-permissions'],
    queryFn: () => listGroups({ page: 1, page_size: 1000 }),
  });
  const permsQ = useQuery({
    queryKey: ['groups-permissions', 'all'],
    queryFn: () => listGroupsPermissions({ page: 1, page_size: 1000 }),
  });

  const allGroups = groupsQ.data?.items ?? [];
  const allPerms = permsQ.data?.items ?? [];

  // (user × group) → existing permission row, if any.
  const permForGroup: Record<number, GroupPermission | undefined> = useMemo(() => {
    const out: Record<number, GroupPermission | undefined> = {};
    for (const p of allPerms) if (p.user_id === userId) out[p.group_id] = p;
    return out;
  }, [allPerms, userId]);

  const mutate = useMutation({
    mutationFn: async (args: { groupId: number; newLevel: string }) => {
      const existing = permForGroup[args.groupId];
      if (args.newLevel === 'Inherit') {
        // Inherit = absence of a row. Delete if a row exists.
        if (existing) await deleteGroupPermission(existing.id);
        return;
      }
      if (existing) {
        await updateGroupPermission(existing.id, args.newLevel);
      } else {
        await createGroupPermission({
          group_id: args.groupId,
          user_id: userId,
          permission: args.newLevel,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups-permissions'] });
    },
  });

  if (groupsQ.isLoading || permsQ.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading…</div>;
  }
  if (allGroups.length === 0) {
    return (
      <div className="p-4 text-sm text-text-muted">
        No groups defined. Create groups under <code>/groups</code> first.
      </div>
    );
  }

  const rows = allGroups.map((g) => ({
    key: `group-${g.id}`,
    label: g.name,
    value: permForGroup[g.id]?.permission || 'Inherit',
    options: INHERIT_LEVEL_OPTIONS,
  }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        <Shield size={12} className="inline -mt-0.5 mr-1" />
        Per-group overrides. <strong>Inherit</strong> falls through to the global Monitors level.
      </p>
      <div className="max-h-[420px] overflow-auto">
        <PermissionMatrix
          rows={rows}
          rowHeader="Group"
          onChange={(rowKey, level) => {
            const groupId = Number(rowKey.replace('group-', ''));
            mutate.mutate({ groupId, newLevel: level });
          }}
        />
      </div>
    </div>
  );
}

/* ----- Monitor permissions tab ------------------------------------------ */

/**
 * Per-monitor permission tab with a simple windowed scroll for installs
 * with 50+ monitors. We render the full table inside a fixed-height
 * scrollable container — the only optimisation is that the heavy
 * effective-permission computation is memoised once per dataset.
 */
function MonitorPermissionsTab({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const userId = user.id;
  const globalMonitors = user.monitors || 'None';

  const monitorsQ = useQuery({
    queryKey: ['monitors', 'for-permissions'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
  });
  const monPermsQ = useQuery({
    queryKey: ['monitors-permissions', 'all'],
    queryFn: () => listMonitorsPermissions({ page: 1, page_size: 1000 }),
  });
  const grpPermsQ = useQuery({
    queryKey: ['groups-permissions', 'all'],
    queryFn: () => listGroupsPermissions({ page: 1, page_size: 1000 }),
  });
  const grpMonsQ = useQuery({
    queryKey: ['groups-monitors', 'for-permissions'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
  });

  const allMonitors = monitorsQ.data?.items ?? [];
  const allMonPerms = monPermsQ.data?.items ?? [];
  const allGrpPerms = grpPermsQ.data?.items ?? [];
  const allGrpMons = grpMonsQ.data?.items ?? [];

  // monitor_id → existing monitor-permission row for this user
  const permForMonitor: Record<number, MonitorPermission | undefined> = useMemo(() => {
    const out: Record<number, MonitorPermission | undefined> = {};
    for (const p of allMonPerms) if (p.user_id === userId) out[p.monitor_id] = p;
    return out;
  }, [allMonPerms, userId]);

  // group_id → permission for this user (Inherit if absent)
  const groupPermissions: Record<number, string> = useMemo(() => {
    const out: Record<number, string> = {};
    for (const p of allGrpPerms) if (p.user_id === userId) out[p.group_id] = p.permission;
    return out;
  }, [allGrpPerms, userId]);

  // monitor_id → list of group_ids it belongs to
  const monitorGroupIds: Record<number, number[]> = useMemo(() => {
    const out: Record<number, number[]> = {};
    for (const gm of allGrpMons) {
      (out[gm.monitor_id] ||= []).push(gm.group_id);
    }
    return out;
  }, [allGrpMons]);

  const mutate = useMutation({
    mutationFn: async (args: { monitorId: number; newLevel: string }) => {
      const existing = permForMonitor[args.monitorId];
      if (args.newLevel === 'Inherit') {
        if (existing) await deleteMonitorPermission(existing.id);
        return;
      }
      if (existing) {
        await updateMonitorPermission(existing.id, args.newLevel);
      } else {
        await createMonitorPermission({
          monitor_id: args.monitorId,
          user_id: userId,
          permission: args.newLevel,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors-permissions'] });
    },
  });

  // Simple windowing: render full table, but inside a height-capped
  // scrollable region. For installs >100 monitors this still scales OK
  // because each row is a plain table row. For >500 we'd swap to
  // virtualisation but the OpenAPI page_size cap is 1000 anyway.
  const scrollRef = useRef<HTMLDivElement>(null);

  if (monitorsQ.isLoading || monPermsQ.isLoading || grpPermsQ.isLoading || grpMonsQ.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading…</div>;
  }
  const visibleMonitors = allMonitors.filter((m) => m.deleted !== 1);
  if (visibleMonitors.length === 0) {
    return <div className="p-4 text-sm text-text-muted">No monitors.</div>;
  }

  const rows = visibleMonitors.map((m) => {
    const monitorPermission = permForMonitor[m.id]?.permission || 'Inherit';
    const groupIds = monitorGroupIds[m.id] ?? [];
    const effective = computeEffectivePermission({
      monitorPermission,
      groupIds,
      groupPermissions,
      globalMonitors,
    });
    return {
      key: `monitor-${m.id}`,
      label: m.name,
      sublabel: `#${m.id}`,
      value: monitorPermission,
      options: INHERIT_LEVEL_OPTIONS,
      trailing: permPill(effective),
    };
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        <Shield size={12} className="inline -mt-0.5 mr-1" />
        Per-monitor overrides. The <strong>Effective</strong> column shows the level after
        combining global Monitors → group → monitor.
      </p>
      <div ref={scrollRef} className="max-h-[420px] overflow-auto border border-border-subtle rounded">
        <PermissionMatrix
          rows={rows}
          rowHeader="Monitor"
          trailingHeader="Effective"
          onChange={(rowKey, level) => {
            const monitorId = Number(rowKey.replace('monitor-', ''));
            mutate.mutate({ monitorId, newLevel: level });
          }}
        />
      </div>
    </div>
  );
}
