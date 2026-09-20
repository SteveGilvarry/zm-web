import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { updateUser } from '@/api/users';
import { useToast } from '@/components/common/toastStore';
import type { User } from '@/types';
import { buildTopLevelRows, PERMISSION_NAMES, type PermissionName } from './permissions';

function isPermissionName(key: string): key is PermissionName {
  return (PERMISSION_NAMES as readonly string[]).includes(key);
}

/**
 * The eight global levels for one user (legacy `user[Stream]`…`user[Devices]`).
 * Each radio change PUTs that one field; the row shown is the last level the
 * backend confirmed plus the change in flight, so a refused save snaps back.
 */
export function useGlobalPermissions(user: User) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [levels, setLevels] = useState<Pick<User, PermissionName>>(user);

  const mutation = useMutation({
    mutationFn: ({ name, level }: { name: PermissionName; level: string }) =>
      updateUser(user.id, { [name]: level }),
    onSuccess: (saved) => {
      setLevels(saved);
      toast.success(t('Permissions saved'));
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err, { name }) => {
      setLevels((prev) => ({ ...prev, [name]: user[name] }));
      toast.apiError(err);
    },
  });

  const setLevel = (rowKey: string, level: string) => {
    if (!isPermissionName(rowKey) || levels[rowKey] === level) return;
    setLevels((prev) => ({ ...prev, [rowKey]: level }));
    mutation.mutate({ name: rowKey, level });
  };

  return { rows: buildTopLevelRows(levels), setLevel, isSaving: mutation.isPending };
}
