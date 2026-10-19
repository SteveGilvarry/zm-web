import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createRole, getRole, updateRole } from '@/api/roles';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { useZmConfig } from '@/features/config/useZmConfig';
import { useAllRoles, useAllUsers } from './queries';
import { ROLE_EDITOR_ROWS, roleChanges, roleCreateInput, roleToForm, type RoleForm } from './roleFields';

/**
 * The role editor (`role.php`): Name, Description and the global
 * permission selects, Save / Cancel, and the users holding the role.
 * `roleId` 0 creates one, as legacy's `rid=0` does.
 *
 * Legacy also edits per-group and per-monitor permissions for a role
 * (`Role_Groups_Permissions`, `Role_Monitors_Permissions`); zm-api does not
 * serve those tables (zm-api#196), so this editor leaves them out.
 */
export function useRoleEditorPage(roleId: number) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = usePerms();
  const canEdit = can('system', 'Edit');
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = roleId === 0;
  const showSnapshots = useZmConfig('ZM_FEATURES_SNAPSHOTS', false);

  const roleQ = useQuery({
    queryKey: ['roles', roleId],
    queryFn: () => getRole(roleId),
    enabled: isAuthenticated && !isNew,
  });
  const rolesQ = useAllRoles();
  const usersQ = useAllUsers();
  const role = roleQ.data ?? null;

  // Edits sit on top of the stored row, so the form fills in when the role
  // arrives without an effect copying it into state.
  const [draft, setDraft] = useState<Partial<RoleForm>>({});
  const form: RoleForm = { ...roleToForm(role), ...draft };
  const setField = <K extends keyof RoleForm>(key: K, value: RoleForm[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const [error, setError] = useState<string | null>(null);

  const assignedUsers = useMemo(
    () =>
      (usersQ.data?.items ?? [])
        .filter((u) => u.role_id === roleId && !isNew)
        .sort((a, b) => a.username.localeCompare(b.username)),
    [usersQ.data, roleId, isNew],
  );

  const backToList = () => void navigate({ to: '/settings/roles' });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) return createRole(roleCreateInput(form));
      const changes = roleChanges(role!, form);
      return Object.keys(changes).length > 0 ? updateRole(roleId, changes) : role!;
    },
    onSuccess: () => {
      toast.success(t('Role saved'));
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      backToList();
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.apiError(e);
    },
  });

  /** Legacy `actions/role.php`: the name is required and unique. */
  const validate = (): string | null => {
    const name = form.name.trim();
    if (!name) return t('Role name is required');
    const clash = (rolesQ.data ?? []).find((r) => r.name === name && r.id !== roleId);
    if (clash) return t('There already exists a role with this Name');
    return null;
  };

  const save = () => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    saveMutation.mutate();
  };

  return {
    isAuthenticated,
    canEdit,
    isNew,
    isLoading: !isNew && roleQ.isLoading,
    isError: !isNew && roleQ.isError,
    error: roleQ.error,
    refetch: () => {
      setDraft({});
      setError(null);
      void roleQ.refetch();
      void usersQ.refetch();
    },
    role,
    /** The stored name, for the page title (`Role - <name>`). */
    title: role?.name ?? '',
    form,
    setField,
    permRows: ROLE_EDITOR_ROWS.filter((r) => r.key !== 'snapshots' || showSnapshots),
    assignedUsers,
    saveError: error,
    isSaving: saveMutation.isPending,
    save,
    cancel: backToList,
  };
}
