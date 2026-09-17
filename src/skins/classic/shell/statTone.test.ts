/**
 * Colour thresholds copied from `getDbConHTML` / `getRamHTML` /
 * `getStorageHTML`, including their strict greater-than comparisons.
 */
import { describe, expect, it } from 'vitest';
import {
  DB_THRESHOLDS, RAM_THRESHOLDS, STAT_TONE_CLASS, STORAGE_THRESHOLDS, statTone,
} from './statTone';
import { versionState } from './versionState';

describe('statTone', () => {
  it('leaves a value at the threshold alone and warns only above it', () => {
    expect(statTone(90, RAM_THRESHOLDS)).toBe('normal');
    expect(statTone(90.1, RAM_THRESHOLDS)).toBe('warn');
    expect(statTone(95, RAM_THRESHOLDS)).toBe('warn');
    expect(statTone(95.1, RAM_THRESHOLDS)).toBe('danger');
  });

  it('never reddens the DB chip — legacy has no danger class for it', () => {
    expect(statTone(99.9, DB_THRESHOLDS)).toBe('warn');
    expect(statTone(100, DB_THRESHOLDS)).toBe('warn');
  });

  it('uses the storage thresholds of 95 and 98', () => {
    expect(statTone(95, STORAGE_THRESHOLDS)).toBe('normal');
    expect(statTone(96, STORAGE_THRESHOLDS)).toBe('warn');
    expect(statTone(99, STORAGE_THRESHOLDS)).toBe('danger');
  });

  it('treats a missing or unusable reading as normal', () => {
    expect(statTone(null, RAM_THRESHOLDS)).toBe('normal');
    expect(statTone(undefined, RAM_THRESHOLDS)).toBe('normal');
    expect(statTone(Number.NaN, RAM_THRESHOLDS)).toBe('normal');
    expect(STAT_TONE_CLASS.normal).toBe('');
  });
});

describe('versionState', () => {
  const base = { version: '1.39.16', checkForUpdates: true, now: 1_000 };

  it('flags a database that is behind the code', () => {
    expect(versionState({ ...base, dbVersion: '1.38.3' }))
      .toEqual({ tone: 'danger', status: 'db-upgrade' });
  });

  it('is quiet when the database matches and nothing newer is known', () => {
    expect(versionState({ ...base, dbVersion: '1.39.16' }).status).toBe('current');
  });

  it('warns when a newer release has been seen', () => {
    expect(versionState({ ...base, lastVersion: '1.40.0' }))
      .toEqual({ tone: 'warn', status: 'update-available' });
  });

  it('stays quiet with update checks off or a reminder still pending', () => {
    expect(versionState({ ...base, lastVersion: '1.40.0', checkForUpdates: false }).status).toBe('current');
    expect(versionState({ ...base, lastVersion: '1.40.0', nextReminder: 2_000 }).status).toBe('current');
  });

  it('compares numerically, not alphabetically', () => {
    expect(versionState({ ...base, version: '1.9.0', lastVersion: '1.10.0' }).status)
      .toBe('update-available');
  });
});
