import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStorageList } from '@/api/storage';
import type { ZmStorage } from '@/types';
import { storageUsage, type StorageUsage } from './storageUsage';

export type StorageTone = 'normal' | 'warn' | 'danger';

/**
 * `getStorageHTML` colours an area warning over 95 % and danger over 98 %,
 * both strictly greater-than.
 */
export const STORAGE_THRESHOLDS = { warn: 95, danger: 98 } as const;

export function storageTone(percent: number): StorageTone {
  if (percent > STORAGE_THRESHOLDS.danger) return 'danger';
  if (percent > STORAGE_THRESHOLDS.warn) return 'warn';
  return 'normal';
}

export interface StorageArea {
  storage: ZmStorage;
  usage: StorageUsage;
  tone: StorageTone;
}

/**
 * Every enabled storage area with its fill level, for the header stat
 * strips (legacy `ZM\Storage::find(array('Enabled'=>true))`). `tone` is
 * the worst area's: legacy colours the collapsed "Storage" dropdown
 * danger when any area is over 98 % and warning when any is over 95 %.
 *
 * The key sits under `['storage']`, so a save on Options → Storage
 * refreshes the strip too.
 */
export function useStorageAreas(options: { enabled: boolean; refetchInterval?: number | false }) {
  const q = useQuery({
    queryKey: ['storage', 'enabled-areas'],
    queryFn: () => getStorageList({ page: 1, page_size: 200 }),
    enabled: options.enabled,
    refetchInterval: options.refetchInterval,
  });
  const areas = useMemo<StorageArea[]>(
    () => (q.data?.items ?? [])
      .filter((s) => s.enabled === 1)
      .map((storage) => {
        const usage = storageUsage(storage);
        return { storage, usage, tone: storageTone(usage.percent) };
      }),
    [q.data],
  );
  const tone: StorageTone = areas.some((a) => a.tone === 'danger')
    ? 'danger'
    : areas.some((a) => a.tone === 'warn') ? 'warn' : 'normal';
  return { areas, tone, isLoading: q.isLoading };
}
