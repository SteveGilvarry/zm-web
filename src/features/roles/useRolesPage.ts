import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { deleteRole, type Role } from '@/api/roles';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { downloadText } from '@/features/users/usersExport';
import { useAllRoles, useAllUsers } from './queries';
import { ROLE_TABLE_COLUMNS } from './roleFields';

export type RoleSortKey = 'name' | 'description' | (typeof ROLE_TABLE_COLUMNS)[number] | 'users';

const EXPORT_COLUMNS = ['id', 'name', 'description', ...ROLE_TABLE_COLUMNS] as const;

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function rolesToCsv(roles: readonly Role[], userCount: (id: number) => number): string {
  const head = [...EXPORT_COLUMNS, 'users'].join(',');
  const rows = roles.map((r) => [...EXPORT_COLUMNS.map((k) => csvCell(r[k])), String(userCount(r.id))].join(','));
  return [head, ...rows].join('\r\n') + '\r\n';
}

/**
 * Options → Roles (`_options_roles.php`): every role by name with its eight
 * levels and how many users hold it, Mark + Delete, and Add New Role.
 * Legacy disables the marks and the Add button without System Edit.
 */
export function useRolesPage() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = usePerms();
  const canEdit = can('system', 'Edit');
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const rolesQ = useAllRoles();
  const usersQ = useAllUsers();
  const roles = useMemo(() => rolesQ.data ?? [], [rolesQ.data]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const u of usersQ.data?.items ?? []) {
      if (u.role_id != null) m.set(u.role_id, (m.get(u.role_id) ?? 0) + 1);
    }
    return m;
  }, [usersQ.data]);
  const userCount = (roleId: number) => counts.get(roleId) ?? 0;

  const [sortKey, setSortKey] = useState<RoleSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sortBy = (key: RoleSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const sorted = useMemo(() => {
    const value = (r: Role): string | number =>
      sortKey === 'users' ? counts.get(r.id) ?? 0 : (r[sortKey] ?? '');
    const out = [...roles].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    });
    return sortDir === 'asc' ? out : out.reverse();
  }, [roles, sortKey, sortDir, counts]);

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = roles.length > 0 && roles.every((r) => selectedIds.has(r.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(roles.map((r) => r.id)));
  const selectedRoles = roles.filter((r) => selectedIds.has(r.id));

  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await deleteRole(id);
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(t('{{count}} role deleted', { count }));
      setSelectedIds(new Set());
    },
    onError: (err) => toast.apiError(err),
    onSettled: () => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      // Users lose the role with it.
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return {
    isAuthenticated,
    isLoading: rolesQ.isLoading,
    isError: rolesQ.isError,
    error: rolesQ.error,
    refetch: () => void rolesQ.refetch(),
    roles: sorted,
    userCount,
    canEdit,
    canView: can('system', 'View'),
    /** Legacy `?view=role&rid=0`. */
    openNew: () => void navigate({ to: '/settings/roles/$roleId', params: { roleId: '0' } }),

    sortKey,
    sortDir,
    sortBy,

    selectedIds,
    selectedRoles,
    toggleSelected,
    allSelected,
    toggleAll,

    confirmOpen,
    requestDelete: () => {
      if (selectedRoles.length > 0) setConfirmOpen(true);
    },
    cancelDelete: () => setConfirmOpen(false),
    confirmDelete: () => deleteMutation.mutate(selectedRoles.map((r) => r.id)),
    isDeleting: deleteMutation.isPending,

    exportRoles: (format: 'csv' | 'json') => {
      if (format === 'csv') downloadText('roles.csv', rolesToCsv(sorted, userCount), 'text/csv');
      else {
        const rows = sorted.map((r) => ({
          ...Object.fromEntries(EXPORT_COLUMNS.map((k) => [k, r[k] ?? null])),
          users: userCount(r.id),
        }));
        downloadText('roles.json', JSON.stringify(rows, null, 2), 'application/json');
      }
    },
  };
}
