import { describe, expect, it } from 'vitest';
import type { Monitor } from '@/types';
import { extractEditableFields, isUnsetSecret, sameValue, sameIdSet, parseIdList, serializeIdList, randomHexColour, WRITE_ONLY_KEYS, HEX_COLOUR } from './editorState';

describe('extractEditableFields', () => {
  it('keeps the stored enum values and every catalogue key', () => {
    const m = { id: 1, name: 'A', orientation: 'Rotate90', event_close_mode: 'System', width: 640, height: 480 } as unknown as Monitor;
    const draft = extractEditableFields(m);
    expect(draft.orientation).toBe('Rotate90');
    expect(draft.event_close_mode).toBe('System');
    expect(draft.height).toBe(480);
    expect(draft.decoder).toBeNull();
    expect('linked_monitors' in draft).toBe(true);
  });

  it('leaves the write-only secrets blank — the API never sends them back', () => {
    const m = { id: 1, name: 'A', user: 'admin' } as unknown as Monitor;
    const draft = extractEditableFields(m);
    expect(draft.pass).toBeNull();
    expect(draft.onvif_password).toBeNull();
  });
});

describe('write-only secrets', () => {
  it('covers both password fields in the catalogue', () => {
    expect([...WRITE_ONLY_KEYS].sort()).toEqual(['onvif_password', 'pass']);
  });

  it('treats blank and null as "leave the stored one alone", any text as a change', () => {
    expect(isUnsetSecret('pass', null)).toBe(true);
    expect(isUnsetSecret('pass', '')).toBe(true);
    expect(isUnsetSecret('onvif_password', '')).toBe(true);
    expect(isUnsetSecret('pass', 'hunter2')).toBe(false);
    // Non-secret fields are never suppressed — clearing `notes` must still save.
    expect(isUnsetSecret('notes', '')).toBe(false);
  });
});

describe('sameValue / sameIdSet', () => {
  it('treats number and numeric string as equal, null only equal to null', () => {
    expect(sameValue(0, '0')).toBe(true);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue(null, 0)).toBe(false);
    expect(sameValue('a', 'b')).toBe(false);
  });
  it('compares id sets regardless of order', () => {
    expect(sameIdSet([1, 2], [2, 1])).toBe(true);
    expect(sameIdSet([1], [1, 2])).toBe(false);
  });
});

describe('linked monitor id lists', () => {
  it('parses ZoneMinder’s comma list and ignores junk', () => {
    expect(parseIdList('1, 2,x,0,3')).toEqual([1, 2, 3]);
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList('')).toEqual([]);
  });
  it('serialises sorted and null when empty', () => {
    expect(serializeIdList([3, 1])).toBe('1,3');
    expect(serializeIdList([])).toBeNull();
  });
});

describe('randomHexColour', () => {
  it('is always a 6-digit hex colour', () => {
    expect(randomHexColour(() => 0)).toBe('#000000');
    expect(randomHexColour(() => 0.999999)).toMatch(HEX_COLOUR);
    expect(randomHexColour()).toMatch(HEX_COLOUR);
  });
});
