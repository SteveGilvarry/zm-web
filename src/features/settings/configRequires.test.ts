import { describe, expect, it } from 'vitest';
import { configFileValue, configLock, effectiveConfigValue, requiresMet } from './configRequires';

const values: Record<string, string> = {
  ZM_OPT_USE_AUTH: '1',
  ZM_AUTH_RELAY: 'hashed',
  ZM_OPT_EMAIL: '0',
};
const valueOf = (name: string) => values[name];

describe('requiresMet', () => {
  it('holds with no requirement', () => {
    expect(requiresMet(null, valueOf)).toBe(true);
    expect(requiresMet('', valueOf)).toBe(true);
  });

  it('needs every clause of a compound requirement', () => {
    expect(requiresMet('ZM_OPT_USE_AUTH=1;ZM_AUTH_RELAY=hashed', valueOf)).toBe(true);
    expect(requiresMet('ZM_OPT_USE_AUTH=1;ZM_AUTH_RELAY=plain', valueOf)).toBe(false);
    expect(requiresMet('ZM_OPT_EMAIL=1', valueOf)).toBe(false);
  });

  it('compares as strings, with whitespace around clauses trimmed', () => {
    expect(requiresMet(' ZM_OPT_USE_AUTH=1 ; ZM_AUTH_RELAY=hashed ', valueOf)).toBe(true);
    expect(requiresMet('ZM_AUTH_RELAY=Hashed', valueOf)).toBe(false);
  });

  it('skips an empty clause, as the page script does', () => {
    expect(requiresMet('ZM_OPT_USE_AUTH=1;', valueOf)).toBe(true);
  });

  it('treats a malformed clause or an unknown option as unmet', () => {
    expect(requiresMet('ZM_OPT_USE_AUTH', valueOf)).toBe(false);
    expect(requiresMet('OPT_USE_AUTH=1', valueOf)).toBe(false);
    expect(requiresMet('ZM_NOT_THERE=1', valueOf)).toBe(false);
  });
});

describe('configFileValue', () => {
  it('turns a boolean word from a conf file into 1 or 0', () => {
    expect(configFileValue(' Yes ', 'boolean')).toBe('1');
    expect(configFileValue('off', 'boolean')).toBe('0');
    expect(configFileValue('1', 'boolean')).toBe('1');
    expect(configFileValue('yes', 'string')).toBe('yes');
  });

  it('only rewrites a file-set row', () => {
    expect(effectiveConfigValue({ value: 'on', type: 'boolean', source: 'file' })).toBe('1');
    expect(effectiveConfigValue({ value: 'on', type: 'boolean', source: 'db' })).toBe('on');
  });
});

describe('configLock', () => {
  const row = { readonly: 0, requires: 'ZM_OPT_EMAIL=1', source: 'db' };
  it('puts permission first, then the conf file, then System, then Requires', () => {
    expect(configLock({ ...row, source: 'file', readonly: 1 }, false, valueOf)).toBe('perm');
    expect(configLock({ ...row, source: 'file', readonly: 1 }, true, valueOf)).toBe('file');
    expect(configLock({ ...row, readonly: 1 }, true, valueOf)).toBe('readonly');
    expect(configLock(row, true, valueOf)).toBe('requires');
    expect(configLock({ ...row, requires: null }, true, valueOf)).toBeNull();
  });
});
