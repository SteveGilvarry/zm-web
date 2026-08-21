/**
 * termsToAst — the refusal paths. Everything the backend's preview endpoint
 * cannot model has to come back `ok: false` with a reason the UI can show,
 * so the page falls back to the client evaluator instead of sending a
 * request the backend answers with a 400.
 */
import { describe, expect, it } from 'vitest';
import { termsToAst } from './toAst';
import type { FilterQuery, FilterTerm } from '@/api/filters';

const q = (terms: FilterTerm[], rest: Partial<FilterQuery> = {}): FilterQuery => ({ terms, ...rest });
const reasonsFor = (terms: FilterTerm[]): string[] => {
  const res = termsToAst(q(terms));
  expect(res.ok).toBe(false);
  return res.ok ? [] : res.reasons;
};

describe('termsToAst — values the preview cannot take', () => {
  it('an empty or non-numeric value on a numeric column', () => {
    expect(reasonsFor([{ attr: 'Frames', op: '>', val: '' }])[0])
      .toMatch(/Frames > "": value cannot be previewed/);
    expect(reasonsFor([{ attr: 'Frames', op: '>', val: 'lots' }])[0])
      .toMatch(/value cannot be previewed/);
  });

  it('a boolean column only takes 0 or 1', () => {
    expect(termsToAst(q([{ attr: 'Archived', op: '=', val: '1' }])).ok).toBe(true);
    expect(reasonsFor([{ attr: 'Archived', op: '=', val: 'yes' }])[0])
      .toMatch(/value cannot be previewed/);
  });

  it('date, time and weekday columns have no AST field at all', () => {
    expect(reasonsFor([{ attr: 'StartDate', op: '=', val: '2026-05-24' }])[0])
      .toMatch(/StartDate: server-side evaluation only/);
    expect(reasonsFor([{ attr: 'StartTime', op: '=', val: '12:00:00' }])[0])
      .toMatch(/server-side evaluation only/);
    expect(reasonsFor([{ attr: 'StartWeekday', op: '=', val: '6' }])[0])
      .toMatch(/server-side evaluation only/);
  });

  it('a datetime must be absolute — a relative expression is client-only', () => {
    expect(termsToAst(q([{ attr: 'StartDateTime', op: '>', val: '2026-05-24 00:00:00' }])).ok).toBe(true);
    expect(reasonsFor([{ attr: 'StartDateTime', op: '>', val: '-1 day' }])[0])
      .toMatch(/value cannot be previewed/);
  });

  it('IS / IS NOT only preview against NULL', () => {
    const ok = termsToAst(q([{ attr: 'EndDateTime', op: 'IS NOT', val: 'NULL' }]));
    expect(ok).toMatchObject({ ok: true, ast: { where: { rules: [{ field: 'end_time', op: 'is_not_null' }] } } });
    expect(reasonsFor([{ attr: 'Archived', op: 'IS', val: '1' }])[0])
      .toMatch(/Archived IS 1: only NULL is previewable/);
  });

  it('regex operators are not supported by preview', () => {
    expect(reasonsFor([{ attr: 'Cause', op: '=~', val: 'Mot.*' }])[0])
      .toMatch(/regex is not supported by preview/);
    expect(reasonsFor([{ attr: 'Cause', op: '!~', val: 'Mot.*' }])[0])
      .toMatch(/regex is not supported by preview/);
  });
});

describe('termsToAst — set operators', () => {
  it('maps =[] and ![] to in / not_in with typed values', () => {
    const res = termsToAst(q([{ attr: 'MonitorId', op: '=[]', val: '1, 2 ,3' }]));
    expect(res).toMatchObject({
      ok: true,
      ast: { where: { match: 'all', rules: [{ field: 'monitor_id', op: 'in', value: [1, 2, 3] }] } },
    });
  });

  it('refuses a set with a member the column type cannot take', () => {
    expect(reasonsFor([{ attr: 'MonitorId', op: '=[]', val: '1, banana' }])[0])
      .toMatch(/MonitorId =\[\]: "banana" is not a valid value/);
  });

  it('refuses an empty set', () => {
    expect(reasonsFor([{ attr: 'MonitorId', op: '![]', val: ' , ' }])[0])
      .toMatch(/MonitorId !\[\]: empty set/);
  });
});

describe('termsToAst — structure', () => {
  it('reports an unbalanced bracket pair', () => {
    expect(reasonsFor([
      { attr: 'Id', op: '>', val: '1', obr: '1' },
      { cnj: 'and', attr: 'Id', op: '<', val: '9', cbr: '0' },
    ])).toContain('brackets do not balance');
  });

  it('reports an empty bracket group', () => {
    // A stray closing bracket leaves a group with no rules in it.
    const reasons = reasonsFor([
      { attr: 'Id', op: '>', val: '1', cbr: '1' },
      { cnj: 'and', attr: 'Id', op: '<', val: '9', obr: '0', cbr: '1' },
    ]);
    expect(reasons.some((r) => /empty bracket group|brackets do not balance/.test(r))).toBe(true);
  });

  it('an empty term list becomes the tautology the backend accepts', () => {
    expect(termsToAst(q([]))).toMatchObject({
      ok: true,
      ast: { where: { match: 'all', rules: [{ field: 'id', op: 'gt', value: 0 }] } },
      notes: [],
    });
  });

  it('LIKE values are wrapped as %contains%', () => {
    expect(termsToAst(q([{ attr: 'Cause', op: 'LIKE', val: 'Motion' }]))).toMatchObject({
      ok: true,
      ast: { where: { rules: [{ field: 'cause', op: 'like', value: '%Motion%' }] } },
    });
    expect(termsToAst(q([{ attr: 'Cause', op: 'NOT LIKE', val: 'Motion' }]))).toMatchObject({
      ok: true,
      ast: { where: { rules: [{ field: 'cause', op: 'not_like', value: '%Motion%' }] } },
    });
  });
});

describe('termsToAst — sort and limit', () => {
  it('notes a sort field the preview cannot order by, and still previews', () => {
    const res = termsToAst(q([{ attr: 'Id', op: '>', val: '0' }], { sort_field: 'Tags', sort_asc: '1' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ast.sort).toBeUndefined();
    expect(res.notes).toEqual(['sort by Tags is not available in preview']);
  });

  it('passes a supported sort through with its direction', () => {
    const res = termsToAst(q([], { sort_field: 'StartDateTime', sort_asc: '0', limit: '25' }));
    expect(res).toMatchObject({ ok: true, ast: { sort: { field: 'start_time', dir: 'desc' }, limit: 25 } });
  });

  it('a zero or non-numeric limit means "all"', () => {
    const zero = termsToAst(q([], { limit: '0' }));
    expect(zero.ok && zero.ast.limit).toBeUndefined();
    const junk = termsToAst(q([], { limit: 'all' }));
    expect(junk.ok && junk.ast.limit).toBeUndefined();
  });
});
