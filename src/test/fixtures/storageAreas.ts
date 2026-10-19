import type { ZmStorage } from '@/types';
import { makeStorage } from './admin';

/**
 * A storage row with the `filesystem` block (zm-api#145). `usedPercent` sets
 * how much of `total` is gone, measured the legacy way (total minus
 * available), so `usedPercent: 79` reads 79 % in both stat strips.
 */
export function makeStorageArea(
  overrides: Partial<ZmStorage> = {},
  fs: { total?: number; usedPercent?: number } = {},
): ZmStorage {
  const total = fs.total ?? 1_000_000_000_000;
  const used = Math.round((total * (fs.usedPercent ?? 50)) / 100);
  return makeStorage({
    filesystem: {
      total_bytes: total,
      // `df` leaves root-reserved blocks out; keep 1 % aside so tests notice
      // if anything reads `used_bytes` instead of total minus available.
      used_bytes: used - Math.round(total / 100),
      available_bytes: total - used,
      usage_percent: ((used - total / 100) / (total - total / 100)) * 100,
    },
    ...overrides,
  });
}
