import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyPreferences } from './legacyPreferences';

const OLD_COLUMNS = 'zm-dashboard.logs.columns';
const NEW_COLUMNS = 'zm-web.logs.columns';
const OLD_HINT = 'zmdash:skinHintDismissed';
const NEW_HINT = 'zm-web:skinHintDismissed';

describe('migrateLegacyPreferences', () => {
  beforeEach(() => window.localStorage.clear());

  it('moves a preference saved under the old project name', () => {
    window.localStorage.setItem(OLD_COLUMNS, '["level","message"]');
    window.localStorage.setItem(OLD_HINT, '1787000000000');

    migrateLegacyPreferences(window.localStorage);

    expect(window.localStorage.getItem(NEW_COLUMNS)).toBe('["level","message"]');
    expect(window.localStorage.getItem(NEW_HINT)).toBe('1787000000000');
    expect(window.localStorage.getItem(OLD_COLUMNS)).toBeNull();
    expect(window.localStorage.getItem(OLD_HINT)).toBeNull();
  });

  it('does not overwrite a preference already saved under the new name', () => {
    window.localStorage.setItem(OLD_COLUMNS, '["old"]');
    window.localStorage.setItem(NEW_COLUMNS, '["new"]');

    migrateLegacyPreferences(window.localStorage);

    expect(window.localStorage.getItem(NEW_COLUMNS)).toBe('["new"]');
    // The stale key still goes, so this only ever runs once.
    expect(window.localStorage.getItem(OLD_COLUMNS)).toBeNull();
  });

  it('is a no-op with nothing to move, and can run twice', () => {
    migrateLegacyPreferences(window.localStorage);
    expect(window.localStorage.length).toBe(0);

    window.localStorage.setItem(OLD_COLUMNS, '["level"]');
    migrateLegacyPreferences(window.localStorage);
    migrateLegacyPreferences(window.localStorage);
    expect(window.localStorage.getItem(NEW_COLUMNS)).toBe('["level"]');
  });

  it('gives up quietly when storage throws', () => {
    const throwing = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage;
    expect(() => migrateLegacyPreferences(throwing)).not.toThrow();
  });

  it('does nothing without storage at all', () => {
    expect(() => migrateLegacyPreferences(undefined)).not.toThrow();
  });
});
