import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUsers, updateUser, deleteUser } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';

export const USERS_PAGE_SIZE = 25;

/**
 * Data + state for Settings → Users: paged list with client-side search,
 * enable toggle, delete-with-confirm, and which user the editor is open on.
 */
export function useUsersPage() {
  const { isAuthenticated, user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users', page, USERS_PAGE_SIZE],
    queryFn: () => getUsers({ page, page_size: USERS_PAGE_SIZE }),
    enabled: isAuthenticated,
  });

  const users = useMemo(() => usersData?.items ?? [], [usersData]);
  const totalPages = usersData?.last_page || 1;
  const total = usersData?.total || 0;

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
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
  const closeEditor = () => setEditorOpen(false);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) =>
      updateUser(id, { enabled }),
    onSuccess: () => {
      invalidateUsers();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateUsers();
    },
  });

  const toggleEnabled = (user: User) =>
    toggleEnabledMutation.mutate({ id: user.id, enabled: user.enabled === 1 ? 0 : 1 });

  const confirmDelete = () => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
  };

  // Prevent deleting yourself
  const isCurrentUser = (u: User) => currentUser?.user === u.username;

  const prevPage = () => setPage((p) => Math.max(1, p - 1));
  const nextPage = () => setPage((p) => Math.min(totalPages, p + 1));

  return {
    isAuthenticated,
    isLoading,
    filteredUsers,
    searchQuery,
    setSearchQuery,
    page,
    totalPages,
    total,
    prevPage,
    nextPage,
    editorOpen,
    editingUser,
    openCreate,
    openEdit,
    closeEditor,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    isDeleting: deleteMutation.isPending,
    toggleEnabled,
    isCurrentUser,
    invalidateUsers,
  };
}
