import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { storageDiskSpaceText, storageUsage, storageUsageTitle } from './storageUsage';
import { storageTone } from './useStorageAreas';

const t = i18n.t.bind(i18n);

// The dev box's Default area on 2026-10-20 (`GET /api/v3/storage`).
const DEV_BOX = {
  type: 'local',
  disk_space: 60_780_671_242,
  filesystem: {
    total_bytes: 253_052_891_136,
    used_bytes: 188_529_205_248,
    available_bytes: 52_910_870_528,
    usage_percent: 78.08529907143961,
  },
};

describe('storageUsage', () => {
  it('counts used as total minus available, the way PHP does, not df', () => {
    const u = storageUsage(DEV_BOX);
    expect(u.usedBytes).toBe(253_052_891_136 - 52_910_870_528);
    // 79.09 %: the header rounds, the Options page truncates.
    expect(u.percent).toBe(79);
    expect(u.percentTruncated).toBe(79);
    expect(u.measured).toBe(true);
  });

  it('rounds for the header and truncates for Options', () => {
    const u = storageUsage({ type: 'local', disk_space: 0, filesystem: { total_bytes: 1000, used_bytes: 0, available_bytes: 355, usage_percent: 0 } });
    expect(u.percent).toBe(65);
    expect(u.percentTruncated).toBe(64);
  });

  it('reads 0 % of nothing without filesystem figures, as legacy does for a missing path', () => {
    const u = storageUsage({ type: 'local', disk_space: 5, filesystem: null });
    expect(u).toMatchObject({ usedBytes: 0, totalBytes: 0, percent: 0, percentTruncated: null, measured: false });
  });

  it('counts an s3fs area\'s events as its used space', () => {
    const u = storageUsage({ ...DEV_BOX, type: 's3fs' });
    expect(u.usedBytes).toBe(60_780_671_242);
    expect(u.percent).toBe(24);
  });
});

describe('storageUsageTitle', () => {
  it('adds the events share when it differs from the used figure', () => {
    expect(storageUsageTitle(storageUsage(DEV_BOX), t)).toBe('186.40GB of 235.67GB 56.61GB used by events');
  });

  it('leaves the events share off when it equals used, or is not cached', () => {
    expect(storageUsageTitle(storageUsage({ ...DEV_BOX, type: 's3fs' }), t)).toBe('56.61GB of 235.67GB');
    expect(storageUsageTitle(storageUsage({ ...DEV_BOX, disk_space: null }), t)).toBe('186.40GB of 235.67GB');
  });
});

describe('storageDiskSpaceText', () => {
  it('prints legacy\'s "NN% used of total"', () => {
    expect(storageDiskSpaceText(storageUsage(DEV_BOX), t)).toBe('79% 186.40GB of 235.67GB');
  });

  it('drops the percentage without a total', () => {
    expect(storageDiskSpaceText(storageUsage({ type: 'local', disk_space: 0, filesystem: null }), t)).toBe('0.00B of 0.00B');
  });
});

describe('storageTone', () => {
  it('warns over 95 and reddens over 98, strictly', () => {
    expect(storageTone(95)).toBe('normal');
    expect(storageTone(96)).toBe('warn');
    expect(storageTone(98)).toBe('warn');
    expect(storageTone(99)).toBe('danger');
  });
});
