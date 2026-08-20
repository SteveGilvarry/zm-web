import { describe, expect, it } from 'vitest';
import type { Monitor } from '@/types';
import { extractEditableFields, sameValue, sameIdSet, parseIdList, serializeIdList, randomHexColour, HEX_COLOUR } from './editorState';

describe('extractEditableFields', () => {
  it('normalises response enum casing and keeps every catalogue key', () => {
    const m = { id: 1, name: 'A', orientation: 'ROTATE_90', event_close_mode: 'system', width: 640, height: 480 } as unknown as Monitor;
    const draft = extractEditableFields(m);
    expect(draft.orientation).toBe('Rotate90');
    expect(draft.event_close_mode).toBe('System');
    expect(draft.height).toBe(480);
    expect(draft.decoder).toBeNull();
    expect('linked_monitors' in draft).toBe(true);
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
