import { describe, expect, it } from 'vitest';
import { parseFilterQuery, type FilterQuery } from '@/api/filters';
import { termsToAst } from './toAst';
import { buildTermTree } from './tree';
import { PURGE_WHEN_FULL_QUERY_JSON, UPDATE_DISK_SPACE_QUERY_JSON, UPDATE_DISK_SPACE_ROW } from './liveFixtures';

const q = (terms: FilterQuery['terms'], rest: Partial<FilterQuery> = {}): FilterQuery => ({ terms, ...rest });

function parsed(raw: string): FilterQuery {
  const out = parseFilterQuery(raw);
  if (!out.ok) throw new Error(out.reason);
  return out.query;
}

describe('termsToAst — live filters', () => {
  it("maps Update DiskSpace exactly to the backend's own `filter` AST", () => {
    const out = termsToAst(parsed(UPDATE_DISK_SPACE_QUERY_JSON));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const expected = {
      match: 'all',
      rules: [
        { field: 'disk_space', op: 'is_null' },
        { field: 'end_time', op: 'is_not_null' },
      ],
    };
    expect(out.ast.where).toEqual(expected);
    // The live row's AST is the same tree; the backend just serialises the
    // absent value as null.
    const live = UPDATE_DISK_SPACE_ROW.filter.where;
    expect({
      match: live.match,
      rules: live.rules.map(({ field, op }) => ({ field, op })),
    }).toEqual(expected);
    expect(out.ast.sort).toBeUndefined();
    expect(out.ast.limit).toBeUndefined();
  });

  it('refuses PurgeWhenFull (DiskPercent is server-side only), naming the term', () => {
    const out = termsToAst(parsed(PURGE_WHEN_FULL_QUERY_JSON));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reasons).toEqual(['DiskPercent: server-side evaluation only']);
  });
});

describe('termsToAst — value typing (verified against the live preview endpoint)', () => {
  it('sends numbers for numeric fields and 0/1 for booleans', () => {
    const out = termsToAst(q([
      { attr: 'MaxScore', op: '>', val: '50' },
      { cnj: 'and', attr: 'Archived', op: '=', val: '0' },
      { cnj: 'and', attr: 'MonitorId', op: '=[]', val: '1, 2,3' },
    ]));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ast.where).toEqual({
      match: 'all',
      rules: [
        { field: 'max_score', op: 'gt', value: 50 },
        { field: 'archived', op: 'eq', value: 0 },
        { field: 'monitor_id', op: 'in', value: [1, 2, 3] },
      ],
    });
  });

  it('converts ZM datetimes to RFC-3339 and refuses relative ones', () => {
    const ok = termsToAst(q([{ attr: 'StartDateTime', op: '>=', val: '2026-08-01 00:00:00' }]));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.ast.where).toEqual({
      match: 'all', rules: [{ field: 'start_time', op: 'gte', value: '2026-08-01T00:00:00Z' }],
    });

    const rel = termsToAst(q([{ attr: 'StartDateTime', op: '>=', val: '-1 day' }]));
    expect(rel.ok).toBe(false);
  });

  it('wraps LIKE values in % (ZM "contains") and refuses regex', () => {
    const like = termsToAst(q([{ attr: 'Cause', op: 'LIKE', val: 'Motion' }]));
    expect(like.ok && like.ast.where).toEqual({
      match: 'all', rules: [{ field: 'cause', op: 'like', value: '%Motion%' }],
    });
    const re = termsToAst(q([{ attr: 'Cause', op: '=~', val: '^Mo' }]));
    expect(re.ok).toBe(false);
    if (!re.ok) expect(re.reasons[0]).toMatch(/regex/);
  });

  it('keeps MonitorName / Monitor client-side (preview rejects monitor_name)', () => {
    expect(termsToAst(q([{ attr: 'MonitorName', op: '=', val: 'Front' }])).ok).toBe(false);
    expect(termsToAst(q([{ attr: 'Monitor', op: '=', val: 'Front' }])).ok).toBe(false);
  });

  it('turns an empty term list into the tautology id > 0 (empty groups are rejected)', () => {
    const out = termsToAst(q([]));
    expect(out.ok && out.ast.where).toEqual({ match: 'all', rules: [{ field: 'id', op: 'gt', value: 0 }] });
  });

  it('maps sort_field / sort_asc / limit, noting an unmappable sort', () => {
    const out = termsToAst(q([{ attr: 'Id', op: '>', val: '0' }], { sort_field: 'StartDateTime', sort_asc: '1', limit: '25' }));
    expect(out.ok && out.ast.sort).toEqual({ field: 'start_time', dir: 'asc' });
    expect(out.ok && out.ast.limit).toBe(25);

    const tags = termsToAst(q([{ attr: 'Id', op: '>', val: '0' }], { sort_field: 'Tags', sort_asc: '0', limit: '0' }));
    expect(tags.ok && tags.ast.sort).toBeUndefined();
    expect(tags.ok && tags.ast.limit).toBeUndefined();
    expect(tags.ok && tags.notes[0]).toMatch(/Tags/);
  });
});

describe('buildTermTree / termsToAst — brackets and precedence', () => {
  it('AND binds tighter than OR without brackets', () => {
    const out = termsToAst(q([
      { attr: 'MonitorId', op: '=', val: '1' },
      { cnj: 'or', attr: 'MonitorId', op: '=', val: '2' },
      { cnj: 'and', attr: 'MaxScore', op: '>', val: '50' },
    ]));
    expect(out.ok && out.ast.where).toEqual({
      match: 'any',
      rules: [
        { field: 'monitor_id', op: 'eq', value: 1 },
        { match: 'all', rules: [
          { field: 'monitor_id', op: 'eq', value: 2 },
          { field: 'max_score', op: 'gt', value: 50 },
        ] },
      ],
    });
  });

  it('obr / cbr override precedence', () => {
    const out = termsToAst(q([
      { obr: '1', attr: 'MonitorId', op: '=', val: '1' },
      { cnj: 'or', attr: 'MonitorId', op: '=', val: '2', cbr: '1' },
      { cnj: 'and', attr: 'MaxScore', op: '>', val: '50' },
    ]));
    expect(out.ok && out.ast.where).toEqual({
      match: 'all',
      rules: [
        { match: 'any', rules: [
          { field: 'monitor_id', op: 'eq', value: 1 },
          { field: 'monitor_id', op: 'eq', value: 2 },
        ] },
        { field: 'max_score', op: 'gt', value: 50 },
      ],
    });
  });

  it('flags unbalanced brackets', () => {
    const { balanced } = buildTermTree([
      { obr: '2', attr: 'Id', op: '=', val: '1', cbr: '1' },
    ]);
    expect(balanced).toBe(false);
    expect(termsToAst(q([{ obr: '2', attr: 'Id', op: '=', val: '1', cbr: '1' }])).ok).toBe(false);
  });
});
