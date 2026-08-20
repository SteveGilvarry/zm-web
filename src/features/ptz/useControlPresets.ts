import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listControlPresets } from '@/api/controlPresets';
import { useAuthStore } from '@/stores/auth';

/**
 * Operator-given names for a monitor's PTZ preset slots
 * (`ControlPresets` rows), keyed by slot number. Empty until loaded or when
 * none are named; the preset bank falls back to the slot number.
 */
export function useControlPresets(monitorId: number, enabled = true): Record<number, string> {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['controlPresets', monitorId],
    queryFn: () => listControlPresets({ monitor_id: monitorId, page: 1, page_size: 100 }),
    enabled: isAuthenticated && enabled,
    staleTime: 60_000,
  });
  const items = q.data?.items;
  return useMemo(() => {
    const out: Record<number, string> = {};
    for (const p of items ?? []) if (p.label) out[p.preset] = p.label;
    return out;
  }, [items]);
}
