import { useQuery } from '@tanstack/react-query';
import { listGroupMonitors } from '@/api/groups';

export interface GroupMembershipState {
  /** Group ids this monitor is in right now (from the server). */
  baseline: number[];
  /** `group_id → groups-monitors row id`, needed to detach. */
  rowIds: Record<number, number>;
  isLoading: boolean;
}

/** Current membership of a monitor, as the editor needs it to diff and to detach. */
export function useGroupMembership(monitorId: number): GroupMembershipState {
  const q = useQuery({
    queryKey: ['groups-monitors', { page_size: 1000 }],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
    staleTime: 30_000,
  });
  const rows = (q.data?.items ?? []).filter((gm) => gm.monitor_id === monitorId);
  const rowIds: Record<number, number> = {};
  for (const r of rows) rowIds[r.group_id] = r.id;
  return { baseline: rows.map((r) => r.group_id), rowIds, isLoading: q.isLoading };
}

