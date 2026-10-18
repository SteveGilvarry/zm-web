import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupMockServer, server } from '@/test/msw/server';
import type { FilterTerm } from '@/api/filters';
import { previewReasons, termsToPreviewQuery } from './termsPreview';
import { parseEventsSearch, parseTermsParam, termsFromEventsSearch } from './eventsSearch';

setupMockServer();

const groupMonitors = [
  { id: 1, group_id: 3, monitor_id: 1 },
  { id: 2, group_id: 3, monitor_id: 2 },
  { id: 3, group_id: 4, monitor_id: 7 },
];
const opts = { groupMonitors, sort: 'id' as const, dir: 'desc' as const };

describe('termsToPreviewQuery', () => {
  it('rewrites Group into the groups\' monitors, keeping the shape', async () => {
    const terms: FilterTerm[] = [
      { attr: 'Group', op: '=', val: '3,4', obr: '1' },
      { cnj: 'or', attr: 'Cause', op: 'LIKE', val: 'Motion', cbr: '1' },
    ];
    const res = await termsToPreviewQuery(terms, opts);
    expect(res).toEqual({
      ok: true,
      ast: {
        where: {
          match: 'any',
          rules: [
            { field: 'monitor_id', op: 'in', value: [1, 2, 7] },
            { field: 'cause', op: 'like', value: '%Motion%' },
          ],
        },
        sort: { field: 'id', dir: 'desc' },
      },
    });
  });

  it('matches nothing for a group with no monitors, everything for != one', async () => {
    const none = await termsToPreviewQuery([{ attr: 'Group', op: '=', val: '9' }], opts);
    expect(none.ok && none.ast.where).toEqual({ match: 'all', rules: [{ field: 'id', op: 'eq', value: 0 }] });
    const all = await termsToPreviewQuery([{ attr: 'Group', op: '!=', val: '9' }], opts);
    expect(all.ok && all.ast.where).toEqual({ match: 'all', rules: [{ field: 'id', op: 'gt', value: 0 }] });
  });

  it('rewrites Tags, legacy sentinels included, into event ids', async () => {
    server.use(http.get('/api/v3/events', () => HttpResponse.json({
      items: [{ id: 11 }, { id: 12 }], total: 2, per_page: 1000, current_page: 1, last_page: 1,
    })));
    const res = await termsToPreviewQuery([{ attr: 'Tags', op: '=', val: '0' }], opts);
    expect(res.ok && res.ast.where).toEqual({
      match: 'all', rules: [{ field: 'id', op: 'not_in', value: [11, 12] }],
    });
    // A JSON-array value, as another client may have written it.
    const json = await termsToPreviewQuery([{ attr: 'Tags', op: '=', val: '[3,5]' }], opts);
    expect(json.ok && json.ast.where).toEqual({
      match: 'all', rules: [{ field: 'id', op: 'in', value: [11, 12] }],
    });
  });

  it('reports what preview cannot run', async () => {
    const res = await termsToPreviewQuery([{ attr: 'Name', op: '=~', val: 'x' }], opts);
    expect(res.ok).toBe(false);
    expect(previewReasons([{ attr: 'Name', op: '=~', val: 'x' }])).not.toEqual([]);
    expect(previewReasons([{ attr: 'Tags', op: '=', val: '3' }, { attr: 'Group', op: '=', val: '1' }])).toEqual([]);
  });
});

describe('the terms param', () => {
  it('accepts a JSON string or an already-parsed list, and nothing else', () => {
    const terms = [{ attr: 'Id', op: '>', val: '0' }];
    expect(parseTermsParam(JSON.stringify(terms))).toEqual(terms);
    expect(parseTermsParam(terms)).toEqual(terms);
    expect(parseTermsParam('[]')).toEqual([]);
    expect(parseTermsParam('not json')).toBeNull();
    expect(parseTermsParam('{"attr":"Id"}')).toBeNull();
    expect(parseTermsParam([{ op: '=' }])).toBeNull();
    expect(parseEventsSearch({ terms, filter_id: '7' })).toEqual({ terms: JSON.stringify(terms), filter_id: 7 });
    expect(parseEventsSearch({ terms: 'junk' })).toEqual({});
  });

  it('is what the Filter button hands on', () => {
    const terms = [{ attr: 'Id', op: '>', val: '0' }];
    expect(termsFromEventsSearch({ terms: JSON.stringify(terms), monitor_id: 3 })).toEqual(terms);
  });
});
