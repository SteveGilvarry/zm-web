import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listGroups, listGroupMonitors } from '@/api/groups';
import { getMonitors } from '@/api/monitors';
import {
  listGroupsPermissions,
  createGroupPermission,
  updateGroupPermission,
  deleteGroupPermission,
  type GroupPermission,
} from '@/api/groupsPermissions';
import { useToast } from '@/components/common/toastStore';
import { buildGroupTree } from '@/features/groups/tree';
import { INHERIT_LEVEL_OPTIONS, type PermissionMatrixRow } from './permissions';

/**
 * Per-group permission overrides for one user, as the legacy user form
 * shows them: the group tree in depth order, each row listing the monitors
 * in that group. `Inherit` is the absence of a row, so choosing it deletes;
 * anything else upserts.
 */
export function useGroupPermissions(userId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const groupsQ = useQuery({
    queryKey: ['groups', 'for-permissions'],
    queryFn: () => listGroups({ page: 1, page_size: 1000 }),
  });
  const permsQ = useQuery({
    queryKey: ['groups-permissions', 'all'],
    queryFn: () => listGroupsPermissions({ page: 1, page_size: 1000 }),
  });
  const groupMonitorsQ = useQuery({
    queryKey: ['groups-monitors', 'for-permissions'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors', 'for-permissions'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
  });

  const allGroups = useMemo(() => groupsQ.data?.items ?? [], [groupsQ.data]);
  const allPerms = useMemo(() => permsQ.data?.items ?? [], [permsQ.data]);
  const tree = useMemo(() => buildGroupTree(allGroups), [allGroups]);

  // (user × group) → existing permission row, if any.
  const permForGroup: Record<number, GroupPermission | undefined> = useMemo(() => {
    const out: Record<number, GroupPermission | undefined> = {};
    for (const p of allPerms) if (p.user_id === userId) out[p.group_id] = p;
    return out;
  }, [allPerms, userId]);

  // group_id → "Front Door, Driveway" (legacy `Group.MonitorIds` column).
  const monitorNamesByGroup = useMemo(() => {
    const nameById = new Map<number, string>();
    for (const m of monitorsQ.data?.items ?? []) nameById.set(m.id, m.name);
    const out = new Map<number, string[]>();
    for (const gm of groupMonitorsQ.data?.items ?? []) {
      const bucket = out.get(gm.group_id) ?? [];
      bucket.push(nameById.get(gm.monitor_id) ?? `#${gm.monitor_id}`);
      out.set(gm.group_id, bucket);
    }
    return out;
  }, [groupMonitorsQ.data, monitorsQ.data]);

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
    onError: (err) => toast.apiError(err),
  });

  const rows: PermissionMatrixRow[] = tree.map(({ group: g, depth }) => ({
    key: `group-${g.id}`,
    label: g.name,
    sublabel: (monitorNamesByGroup.get(g.id) ?? []).join(', ') || undefined,
    depth,
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
