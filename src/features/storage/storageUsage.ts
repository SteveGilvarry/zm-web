import type { TFunction } from 'i18next';
import type { ZmStorage } from '@/types';
import { humanFilesize } from '@/lib/format';

/**
 * How full a storage area is, worked out the way legacy's `Storage.php`
 * does it, from the `filesystem` block zm-api#145 added.
 *
 * - Used space is total minus *available* (`disk_total_space() -
 *   disk_free_space()`; PHP's free space is the blocks a normal user may
 *   still write, `f_bavail`). The backend's own `used_bytes` and
 *   `usage_percent` follow `df` instead, which leaves the root-reserved
 *   blocks out of both sides and reads a point or so lower, so they are
 *   not used here. On the dev box: legacy 79 %, `usage_percent` 78.1.
 * - An `s3fs` area counts its events' size as used (`disk_used_space`).
 * - No filesystem figures (path not mounted where zm-api runs) reads as
 *   0 % of 0 bytes, which is what legacy prints when the path is missing.
 */
export interface StorageUsage {
  usedBytes: number;
  totalBytes: number;
  /** Bytes used by events (`Storage.DiskSpace`), null when not cached yet. */
  eventBytes: number | null;
  /** False when there is no total to measure against (legacy shows 0 %). */
  measured: boolean;
  /** `disk_usage_percent()`: rounded, 0 without a total. Drives the stat strip. */
  percent: number;
  /** `_options_storage.php` truncates with `intval`; null without a total. */
  percentTruncated: number | null;
}

export function storageUsage(storage: Pick<ZmStorage, 'type' | 'disk_space' | 'filesystem'>): StorageUsage {
  const fs = storage.filesystem ?? null;
  const eventBytes = storage.disk_space ?? null;
  const totalBytes = fs?.total_bytes ?? 0;
  const usedBytes = storage.type === 's3fs'
    ? (eventBytes ?? 0)
    : fs ? fs.total_bytes - fs.available_bytes : 0;
  const ratio = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : null;
  return {
    usedBytes,
    totalBytes,
    eventBytes,
    measured: ratio != null,
    percent: ratio == null ? 0 : Math.round(ratio),
    percentTruncated: ratio == null ? null : Math.trunc(ratio),
  };
}

/**
 * The stat strip's tooltip (`getStorageHTML`): "used of total", plus
 * "X used by events" when that differs from the used figure. Legacy sums
 * the events itself when the cached figure is missing; zm-api does not, so
 * that half is left off until zmaudit has cached one.
 */
export function storageUsageTitle(
  usage: StorageUsage,
  t: TFunction,
): string {
  const base = t('{{used}} of {{total}}', {
    used: humanFilesize(usage.usedBytes),
    total: humanFilesize(usage.totalBytes),
  });
  if (usage.eventBytes == null || usage.eventBytes === usage.usedBytes) return base;
  return `${base} ${t('{{size}} used by events', { size: humanFilesize(usage.eventBytes) })}`;
}

/** Options → Storage "Disk Space" cell: `64% 152.63GB of 235.67GB`. */
export function storageDiskSpaceText(
  usage: StorageUsage,
  t: TFunction,
): string {
  const of = t('{{used}} of {{total}}', {
    used: humanFilesize(usage.usedBytes),
    total: humanFilesize(usage.totalBytes),
  });
  return usage.percentTruncated == null ? of : `${usage.percentTruncated}% ${of}`;
}
