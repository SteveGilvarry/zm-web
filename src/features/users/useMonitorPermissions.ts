import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listGroupMonitors } from '@/api/groups';
import { getMonitors } from '@/api/monitors';
import { listGroupsPermissions } from '@/api/groupsPermissions';
import {
  listMonitorsPermissions,
  createMonitorPermission,
  updateMonitorPermission,
  deleteMonitorPermission,
  type MonitorPermission,
} from '@/api/monitorsPermissions';
import { useToast } from '@/components/common/toastStore';
import type { User } from '@/types';
import { computeEffectivePermission, INHERIT_LEVEL_OPTIONS } from './permissions';

export interface MonitorPermissionRow {
  key: string;
  label: string;
  sublabel: string;
  value: string;
  options: readonly string[];
  /** Level after combining global Monitors → group → monitor. */
  effective: string;
}

/**
 * Per-monitor permission overrides for one user, plus the effective level
 * for each monitor. The heavy effective-permission computation is memoised
 * once per dataset; the page renders the full table in a scroll region.
 */
export function useMonitorPermissions(user: User) {
  const queryClient = useQueryClient();
  const toast = useToast();
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
  const allMonPerms = useMemo(() => monPermsQ.data?.items ?? [], [monPermsQ.data]);
  const allGrpPerms = useMemo(() => grpPermsQ.data?.items ?? [], [grpPermsQ.data]);
  const allGrpMons = useMemo(() => grpMonsQ.data?.items ?? [], [grpMonsQ.data]);

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

  const mutation = useMutation({
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
    onError: (err) => toast.apiError(err),
  });

  const visibleMonitors = allMonitors.filter((m) => m.deleted !== 1);

  const rows: MonitorPermissionRow[] = visibleMonitors.map((m) => {
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
      effective,
    };
  });

  const setLevel = (rowKey: string, level: string) => {
    const monitorId = Number(rowKey.replace('monitor-', ''));
    mutation.mutate({ monitorId, newLevel: level });
  };

  return {
    isLoading:
      monitorsQ.isLoading || monPermsQ.isLoading || grpPermsQ.isLoading || grpMonsQ.isLoading,
    hasMonitors: visibleMonitors.length > 0,
    rows,
    setLevel,
  };
}
