import { describe, expect, it } from 'vitest';
import { compareVersions, updateNotice } from './updateNotice';

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => {
    // The bug this exists to avoid: "1.10" sorts before "1.9" as a string.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.39.16', '1.39.9')).toBe(1);
  });

  it('treats missing components as zero', () => {
    expect(compareVersions('1.39', '1.39.0')).toBe(0);
    expect(compareVersions('1.39.1', '1.39')).toBe(1);
  });

  it('compares a packaged build by its leading numbers', () => {
    expect(compareVersions('1.39.16-1ubuntu2', '1.39.16')).toBe(0);
    expect(compareVersions('1.40.0-rc1', '1.39.16')).toBe(1);
  });
});

describe('updateNotice', () => {
  const current = '1.39.16';

  it('announces a newer release', () => {
    expect(updateNotice({ enabled: true, current, latest: '1.40.0' }))
      .toEqual({ current: '1.39.16', latest: '1.40.0' });
  });

  it('says nothing when current, behind, or equal', () => {
    expect(updateNotice({ enabled: true, current, latest: '1.39.16' })).toBeNull();
    expect(updateNotice({ enabled: true, current, latest: '1.39.1' })).toBeNull();
  });

  it('says nothing when the check is off or a version is missing', () => {
    expect(updateNotice({ enabled: false, current, latest: '1.40.0' })).toBeNull();
    expect(updateNotice({ enabled: true, current: undefined, latest: '1.40.0' })).toBeNull();
    expect(updateNotice({ enabled: true, current, latest: '' })).toBeNull();
    expect(updateNotice({ enabled: true, current, latest: '   ' })).toBeNull();
  });
});
