import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { getUsers, getUser, updateUser, deleteUser } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { useMe } from '@/features/auth/useMe';
import { useZmConfig } from '@/features/config/useZmConfig';
import type { User } from '@/types';
import { exportUsers as exportUsersFile } from './usersExport';

export const USERS_PAGE_SIZE = 25;
/** The API caps `page_size` at 1000; one request covers any real install. */
const ALL_USERS_PAGE_SIZE = 1000;

/** `?uid=0` is the create form (legacy `?view=user&uid=0`), `?uid=<n>` edits. */
export type UserEditorTarget = number | null;

function parseUid(raw: unknown): UserEditorTarget {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Settings → Users. The whole user list is fetched once so search spans
 * every page; paging is client-side. The editor target lives in `?uid=`
 * so legacy links and the browser back button both work.
 *
 * Permissions follow legacy `user.php`: System Edit for everything, or —
 * with `ZM_USER_SELF_EDIT` on — a user may open their own row, where the
 * backend accepts email only (`UpdateUserRequest`).
 */
export function useUsersPage() {
  const { t } = useTranslation();
  const { isAuthenticated, user: currentUser } = useAuthStore();
  const { can } = usePerms();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { uid?: unknown };
  const editorTarget = parseUid(search.uid);
  const selfEditEnabled = useZmConfig('ZM_USER_SELF_EDIT', false);

  const canEdit = can('system', 'Edit');
  // `/me` is authoritative about who you are; the token's `uid`/`user` claims
  // stand in until it answers (and on tokens issued without a `uid`).
  const { data: me } = useMe();
  const isCurrentUser = (u: Pick<User, 'username' | 'id'>) => {
    if (me) return me.id === u.id;
    if (currentUser == null) return false;
    return currentUser.uid != null ? currentUser.uid === u.id : currentUser.user === u.username;
  };
  /** Admins edit anyone; with self-edit on, a user may edit their own row. */
  const canEditUser = (u: User) => canEdit || (selfEditEnabled && isCurrentUser(u));

  const usersQ = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => getUsers({ page: 1, page_size: ALL_USERS_PAGE_SIZE }),
    enabled: isAuthenticated,
  });
  const users = useMemo(() => usersQ.data?.items ?? [], [usersQ.data]);
  const total = usersQ.data?.total ?? users.length;

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQueryRaw] = useState('');
  const setSearchQuery = (q: string) => {
    setSearchQueryRaw(q);
    setPage(1);
  };

  const matching = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...users].sort((a, b) => a.username.localeCompare(b.username));
    if (!q) return sorted;
    return sorted.filter(
      (u) =>
        u.username.toLowerCase().includes(q)
        || u.name.toLowerCase().includes(q)
        || u.email.toLowerCase().includes(q),
    );
  }, [users, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(matching.length / USERS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const filteredUsers = matching.slice((safePage - 1) * USERS_PAGE_SIZE, safePage * USERS_PAGE_SIZE);

  /* ----- Editor (target in the URL) --------------------------------------- */

  const listed = editorTarget ? users.find((u) => u.id === editorTarget) ?? null : null;
  const singleQ = useQuery({
    queryKey: ['users', editorTarget],
    queryFn: () => getUser(editorTarget as number),
    enabled: isAuthenticated && !!editorTarget && !listed && usersQ.isSuccess,
  });
  const editingUser: User | null = editorTarget ? listed ?? singleQ.data ?? null : null;
  const editorOpen = editorTarget !== null && (editorTarget === 0 ? canEdit : editingUser !== null && canEditUser(editingUser));
  const editorLoading = !!editorTarget && !editingUser && (usersQ.isLoading || singleQ.isLoading);
  /** Self-edit: only the fields the backend lets a non-admin change. */
  const editorMode: 'admin' | 'self' = canEdit ? 'admin' : 'self';
  /** The editor is open on the signed-in operator's own row — the one case
   *  where `PUT /me/password` applies, admin or not. */
  const editingSelf = editingUser !== null && isCurrentUser(editingUser);

  const setEditorTarget = (target: UserEditorTarget) =>
    void navigate({
      to: '/settings/users',
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (target === null) delete next.uid;
        else next.uid = target;
        return next;
      },
      replace: target === null,
    });

  const invalidateUsers = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  /* ----- Change your own password ----------------------------------------- */

  // Sequential, not stacked: the editor closes before the password dialog
  // opens, so there is never a dialog inside a dialog.
  const [passwordOpen, setPasswordOpen] = useState(false);
  const openPasswordChange = () => {
    setEditorTarget(null);
    setPasswordOpen(true);
  };

  /* ----- Selection + delete ------------------------------------------------ */

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const deletable = filteredUsers.filter((u) => !isCurrentUser(u));
  const toggleAll = () =>
    setSelectedIds((prev) =>
      deletable.length > 0 && deletable.every((u) => prev.has(u.id))
        ? new Set()
        : new Set(deletable.map((u) => u.id)));
  const selectedUsers = users.filter((u) => selectedIds.has(u.id));

  const [deleteTargets, setDeleteTargets] = useState<User[]>([]);
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await deleteUser(id);
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(t('{{count}} user deleted', { count }));
      setSelectedIds(new Set());
    },
    onError: (err) => toast.apiError(err),
    onSettled: () => {
      setDeleteTargets([]);
      invalidateUsers();
    },
  });
  const requestDelete = (targets: User | User[]) => {
    const list = (Array.isArray(targets) ? targets : [targets]).filter((u) => !isCurrentUser(u));
    if (list.length > 0) setDeleteTargets(list);
  };
  const confirmDelete = () => {
    if (deleteTargets.length > 0) deleteMutation.mutate(deleteTargets.map((u) => u.id));
  };

  /* ----- Enable toggle ------------------------------------------------------ */

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) => updateUser(id, { enabled }),
    onSuccess: invalidateUsers,
    onError: (err) => {
      toast.apiError(err);
      invalidateUsers();
    },
  });
  const toggleEnabled = (user: User) =>
    toggleEnabledMutation.mutate({ id: user.id, enabled: user.enabled === 1 ? 0 : 1 });

  return {
    isAuthenticated,
    isLoading: usersQ.isLoading,
    isError: usersQ.isError,
    error: usersQ.error,
    refetch: () => void usersQ.refetch(),
    users,
    filteredUsers,
    matchingCount: matching.length,
    searchQuery,
    setSearchQuery,
    page: safePage,
    totalPages,
    total,
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
    nextPage: () => setPage((p) => Math.min(totalPages, p + 1)),

    canEdit,
    canView: can('system', 'View'),
    selfEditEnabled,
    canEditUser,
    isCurrentUser,

    editorOpen,
    editorLoading,
    editingUser,
    editorMode,
    editingSelf,
    passwordOpen,
    openPasswordChange,
    closePasswordChange: () => setPasswordOpen(false),
    openCreate: () => setEditorTarget(0),
    openEdit: (user: User) => setEditorTarget(user.id),
    closeEditor: () => setEditorTarget(null),
    invalidateUsers,

    selectedIds,
    selectedUsers,
    toggleSelected,
    toggleAll,
    clearSelection: () => setSelectedIds(new Set()),

    deleteTargets,
    requestDelete,
    clearDelete: () => setDeleteTargets([]),
    confirmDelete,
    isDeleting: deleteMutation.isPending,

    toggleEnabled,
    exportUsers: (format: 'csv' | 'json') => exportUsersFile(matching, format),
  };
}
