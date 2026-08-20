import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listGroups } from '@/api/groups';
import {
  listGroupsPermissions,
  createGroupPermission,
  updateGroupPermission,
  deleteGroupPermission,
  type GroupPermission,
} from '@/api/groupsPermissions';
import { INHERIT_LEVEL_OPTIONS, type PermissionMatrixRow } from './permissions';

/**
 * Per-group permission overrides for one user. `Inherit` is the absence of
 * a row, so choosing it deletes; anything else upserts.
 */
export function useGroupPermissions(userId: number) {
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
  const allPerms = useMemo(() => permsQ.data?.items ?? [], [permsQ.data]);

  // (user × group) → existing permission row, if any.
  const permForGroup: Record<number, GroupPermission | undefined> = useMemo(() => {
    const out: Record<number, GroupPermission | undefined> = {};
    for (const p of allPerms) if (p.user_id === userId) out[p.group_id] = p;
    return out;
  }, [allPerms, userId]);

  const mutation = useMutation({
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

  const rows: PermissionMatrixRow[] = allGroups.map((g) => ({
    key: `group-${g.id}`,
    label: g.name,
    value: permForGroup[g.id]?.permission || 'Inherit',
    options: INHERIT_LEVEL_OPTIONS,
  }));

  const setLevel = (rowKey: string, level: string) => {
    const groupId = Number(rowKey.replace('group-', ''));
    mutation.mutate({ groupId, newLevel: level });
  };

  return {
    isLoading: groupsQ.isLoading || permsQ.isLoading,
    hasGroups: allGroups.length > 0,
    rows,
    setLevel,
  };
}
