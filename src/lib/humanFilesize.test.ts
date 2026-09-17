import { describe, expect, it } from 'vitest';
import { humanFilesize } from './format';

/**
 * Values checked against ZoneMinder 1.39.16's console on the reference box:
 * `0.00B`, `318.93MB`, `42.14GB`, `166.47kB/s`, `53.52GB`.
 */
describe('humanFilesize (legacy fidelity)', () => {
  it('prints two decimals with no space and a lowercase k', () => {
    expect(humanFilesize(1024)).toBe('1.00kB');
    expect(humanFilesize(1024 * 1024)).toBe('1.00MB');
    expect(humanFilesize(53.52 * 1024 ** 3)).toBe('53.52GB');
  });

  it('steps up at 0.9 of a unit, not at a whole one', () => {
    // 1000 bytes is 0.98 of a kB, and legacy shows it as such.
    expect(humanFilesize(1000)).toBe('0.98kB');
    expect(humanFilesize(920)).toBe('920.00B');
  });

  it('distinguishes zero from null — the bug this replaced', () => {
    // A monitor with events but no disk space: legacy prints 0.00B.
    expect(humanFilesize(0)).toBe('0.00B');
    // SUM(DiskSpace) over no rows is NULL, and legacy prints it literally.
    expect(humanFilesize(null)).toBe('null');
    expect(humanFilesize(undefined)).toBe('null');
  });

  it('stops at the largest unit it knows', () => {
    expect(humanFilesize(1024 ** 6)).toBe('1024.00PB');
  });
});
