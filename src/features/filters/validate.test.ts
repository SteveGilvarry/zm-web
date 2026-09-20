import { describe, expect, it } from 'vitest';
import { validateDraft } from './validate';
import { FILTER_FLAG_DEFAULTS, type FilterColumns, type FilterQuery, type FilterTerm } from '@/api/filters';

const t = (s: string) => s;
const cols = (over: Partial<FilterColumns> = {}): FilterColumns =>
  ({ ...FILTER_FLAG_DEFAULTS, ...over } as FilterColumns);
const q = (terms: FilterTerm[], over: Partial<FilterQuery> = {}): FilterQuery =>
  ({ terms, ...over });

const ok = q([{ attr: 'Cause', op: '=', val: 'Motion' }]);

describe('validateDraft — hard stops', () => {
  it('passes a plain filter with no actions', () => {
    expect(validateDraft(ok, cols(), t)).toEqual({ errors: [], confirms: [], notices: [] });
  });

  it('blocks an empty term value', () => {
    const v = validateDraft(q([{ attr: 'Cause', op: '=', val: '' }]), cols(), t);
    expect(v.errors).toEqual(['Every condition needs a value.']);
  });

  it('treats whitespace and a missing value as empty', () => {
    expect(validateDraft(q([{ attr: 'Cause', op: '=', val: '   ' }]), cols(), t).errors).toHaveLength(1);
    expect(validateDraft(q([{ attr: 'Cause', op: '=' } as FilterTerm]), cols(), t).errors).toHaveLength(1);
  });

  it('blocks unbalanced brackets', () => {
    const v = validateDraft(q([
      { obr: '1', attr: 'Cause', op: '=', val: 'Motion', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'MaxScore', op: '>', val: '5', cbr: '0' },
    ]), cols(), t);
    expect(v.errors).toEqual(['The brackets in the conditions are unbalanced.']);
  });

  it('accepts balanced brackets', () => {
    const v = validateDraft(q([
      { obr: '1', attr: 'Cause', op: '=', val: 'Motion', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'MaxScore', op: '>', val: '5', cbr: '1' },
    ]), cols(), t);
    expect(v.errors).toEqual([]);
  });

  it('blocks a non-numeric limit but allows an empty one', () => {
    expect(validateDraft(q(ok.terms, { limit: '20a' }), cols(), t).errors)
      .toEqual(['The limit must be a whole number, or empty.']);
    expect(validateDraft(q(ok.terms, { limit: '' }), cols(), t).errors).toEqual([]);
    expect(validateDraft(q(ok.terms, { limit: '20' }), cols(), t).errors).toEqual([]);
  });

  it('refuses a draft whose saved query could not be read', () => {
    const v = validateDraft(null, cols(), t);
    expect(v.errors).toHaveLength(1);
    expect(v.confirms).toEqual([]);
  });
});

describe('validateDraft — confirms and notices follow legacy’s else-if chain', () => {
  it('auto-delete with no Archived term asks first', () => {
    const v = validateDraft(ok, cols({ auto_delete: 1 }), t);
    expect(v.errors).toEqual([]);
    expect(v.confirms).toHaveLength(1);
    expect(v.confirms[0]).toMatch(/archived/i);
  });

  it('auto-delete with an Archived term is quiet', () => {
    const v = validateDraft(q([{ attr: 'Archived', op: '=', val: '0' }]), cols({ auto_delete: 1 }), t);
    expect(v.confirms).toEqual([]);
  });

  it('update-disk-space with no end-time term asks', () => {
    const v = validateDraft(ok, cols({ update_disk_space: 1 }), t);
    expect(v.confirms).toHaveLength(1);
    expect(v.confirms[0]).toMatch(/disk space/i);
  });

  it.each(['EndDateTime', 'EndTime', 'EndDate'])('%s satisfies the disk-space check', (attr) => {
    const v = validateDraft(q([{ attr, op: 'IS NOT', val: 'NULL' } as FilterTerm]), cols({ update_disk_space: 1 }), t);
    expect(v.confirms).toEqual([]);
  });

  it('auto-delete outranks the disk-space confirm — only one is ever raised', () => {
    const v = validateDraft(ok, cols({ auto_delete: 1, update_disk_space: 1 }), t);
    expect(v.confirms).toHaveLength(1);
    expect(v.confirms[0]).toMatch(/archived/i);
  });

  it('background with no action is a notice, not a block', () => {
    const v = validateDraft(ok, cols({ background: 1 }), t);
    expect(v.errors).toEqual([]);
    expect(v.confirms).toEqual([]);
    expect(v.notices).toHaveLength(1);
  });

  it('background with an action ticked says nothing', () => {
    expect(validateDraft(ok, cols({ background: 1, auto_archive: 1 }), t).notices).toEqual([]);
    expect(validateDraft(ok, cols({ background: 1, auto_move: 1 }), t).notices).toEqual([]);
  });

  it('a hard error and a confirm can be reported together — the page stops at the error', () => {
    const v = validateDraft(q([{ attr: 'Cause', op: '=', val: '' }]), cols({ auto_delete: 1 }), t);
    expect(v.errors).toHaveLength(1);
    expect(v.confirms).toHaveLength(1);
  });
});
