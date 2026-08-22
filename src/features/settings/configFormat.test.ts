import { describe, expect, it } from 'vitest';
import {
  configDefaultValue,
  configPatternError,
  isAtDefault,
  perlPatternToRegExp,
} from './configFormat';
import type { ZmConfig } from '@/types';

const row = (over: Partial<ZmConfig>): ZmConfig => ({
  id: 1, name: 'ZM_X', value: '', type: 'string', category: 'system',
  readonly: 0, private: 0, system: 0, ...over,
});

describe('perlPatternToRegExp', () => {
  it('translates the common qr// spellings from the dev box', () => {
    expect(perlPatternToRegExp('(?^i:^([yn]))')).toEqual(/^([yn])/i);
    expect(perlPatternToRegExp('(?^:^(\\d+)$)')).toEqual(/^(\d+)$/);
    expect(perlPatternToRegExp('(?^:^((?:/[^/]*)+?)/?$)')).toEqual(/^((?:\/[^/]*)+?)\/?$/);
    expect(perlPatternToRegExp('(?^:.)')).toEqual(/./);
  });

  it('refuses what it cannot express and empty input', () => {
    expect(perlPatternToRegExp(null)).toBeNull();
    expect(perlPatternToRegExp('(?^x:^ (\\d+) $)')).toBeNull();
    expect(perlPatternToRegExp('(?^:\\A\\d+\\Z)')).toBeNull();
    expect(perlPatternToRegExp('(?^:^(+)$)')).toBeNull();
  });
});

describe('configPatternError', () => {
  it('flags a mismatch and accepts a match', () => {
    const c = row({ type: 'integer', pattern: '(?^:^(\\d+)$)' });
    expect(configPatternError(c, '12x')).toMatch(/pattern/);
    expect(configPatternError(c, '120')).toBeNull();
  });

  it('skips booleans, empty values and untranslatable patterns', () => {
    expect(configPatternError(row({ type: 'boolean', pattern: '(?^i:^([yn]))' }), '1')).toBeNull();
    expect(configPatternError(row({ pattern: '(?^:^(.+)$)' }), '')).toBeNull();
    expect(configPatternError(row({ pattern: '(?^:\\A.\\Z)' }), 'whatever')).toBeNull();
  });
});

describe('configDefaultValue / isAtDefault', () => {
  it('maps boolean yes/no defaults onto the stored 0/1', () => {
    expect(configDefaultValue(row({ type: 'boolean', default_value: 'no' }))).toBe('0');
    expect(configDefaultValue(row({ type: 'boolean', default_value: 'yes' }))).toBe('1');
    expect(configDefaultValue(row({ type: 'integer', default_value: '25' }))).toBe('25');
    expect(configDefaultValue(row({ default_value: null }))).toBeNull();
  });

  it('treats a missing default as already-at-default', () => {
    expect(isAtDefault(row({ value: 'x', default_value: null }))).toBe(true);
    expect(isAtDefault(row({ type: 'boolean', value: '0', default_value: 'no' }))).toBe(true);
    expect(isAtDefault(row({ type: 'integer', value: '30', default_value: '25' }))).toBe(false);
  });
});
