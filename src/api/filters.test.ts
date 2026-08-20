import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listFilters,
  getFilter,
  createFilter,
  updateFilter,
  deleteFilter,
  previewFilter,
  parseFilterQuery,
  serializeFilterQuery,
  FILTER_ATTRS,
  FILTER_OPS,
  FILTER_SORT_FIELDS,
  type FilterQuery,
} from './filters';
import {
  PURGE_WHEN_FULL_QUERY_JSON,
  PURGE_WHEN_FULL_ROW,
  UPDATE_DISK_SPACE_QUERY_JSON,
  UPDATE_DISK_SPACE_ROW,
} from '@/features/filters/liveFixtures';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('legacy vocabularies', () => {
  it('has the 43 legacy attributes, 14 operators and 16 sort fields', () => {
    expect(FILTER_ATTRS).toHaveLength(43);
    expect(FILTER_OPS).toHaveLength(14);
    expect(FILTER_SORT_FIELDS).toHaveLength(16);
    expect(FILTER_OPS).not.toContain('contains');
  });
});

describe('parseFilterQuery — live ZoneMinder filters', () => {
  it('reads PurgeWhenFull: three terms, sort, limit, skip_locked', () => {
    const out = parseFilterQuery(PURGE_WHEN_FULL_QUERY_JSON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.query.terms.map((t) => [t.attr, t.op, t.val])).toEqual([
      ['Archived', '=', '0'],
      ['DiskPercent', '>=', '80'],
      ['EndDateTime', 'IS NOT', 'NULL'],
    ]);
    expect(out.query.terms[0].cnj).toBeUndefined();
    expect(out.query.terms[1].cnj).toBe('and');
    expect(out.query.sort_field).toBe('Id');
    expect(out.query.sort_asc).toBe('1');
    expect(out.query.limit).toBe('100');
    expect(out.query.skip_locked).toBe('0');
  });

  it('reads Update DiskSpace: first term without obr/cbr/cnj, no sort keys', () => {
    const out = parseFilterQuery(UPDATE_DISK_SPACE_QUERY_JSON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.query.terms).toHaveLength(2);
    expect(out.query.terms[0]).toEqual({ attr: 'DiskSpace', op: 'IS', val: 'NULL' });
    expect(out.query.sort_field).toBeUndefined();
  });

  it('round-trips both live filters byte-for-byte', () => {
    for (const raw of [PURGE_WHEN_FULL_QUERY_JSON, UPDATE_DISK_SPACE_QUERY_JSON]) {
      const out = parseFilterQuery(raw);
      expect(out.ok).toBe(true);
      if (out.ok) expect(serializeFilterQuery(out.query)).toBe(raw);
    }
  });

  it('preserves properties it does not know about', () => {
    const raw = '{"terms":[{"attr":"Cause","op":"=","val":"Motion","future":"x"}],"sort_field":"Id","new_key":{"a":1}}';
    const out = parseFilterQuery(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.query.terms[0].future).toBe('x');
      expect(out.query.new_key).toEqual({ a: 1 });
      expect(serializeFilterQuery(out.query)).toBe(raw);
    }
  });
});

describe('parseFilterQuery — refusing what it cannot read', () => {
  it('treats null / "" / "{}" as an empty rule set', () => {
    for (const s of [null, undefined, '', '   ', '{}']) {
      const out = parseFilterQuery(s);
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.query.terms).toEqual([]);
    }
  });

  it('rejects malformed JSON instead of returning empty', () => {
    const out = parseFilterQuery('not-json');
    expect(out).toMatchObject({ ok: false, raw: 'not-json' });
  });

  it("rejects the dashboard's retired private {rules} format", () => {
    const raw = JSON.stringify({ rules: [{ field: 'cause', operator: 'contains', value: 'x' }] });
    const out = parseFilterQuery(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/terms/);
  });

  it('rejects a non-array terms, a term without attr, and an unknown operator', () => {
    expect(parseFilterQuery('{"terms":"oops"}').ok).toBe(false);
    expect(parseFilterQuery('{"terms":[{"op":"=","val":"1"}]}').ok).toBe(false);
    expect(parseFilterQuery('{"terms":[{"attr":"Cause","op":"contains","val":"x"}]}').ok).toBe(false);
    expect(parseFilterQuery('{"terms":[{"attr":"Cause","op":"=","val":"x","cnj":"xor"}]}').ok).toBe(false);
  });

  it('keeps the raw text for the read-only view', () => {
    const out = parseFilterQuery('[1,2]');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.raw).toBe('[1,2]');
  });
});

describe('listFilters / getFilter', () => {
  it('listFilters GETs /filters and returns full rows', async () => {
    server.use(
      http.get('/api/v3/filters', () => HttpResponse.json({
        items: [PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW],
        total: 2, per_page: 25, current_page: 1, last_page: 1,
      })),
    );
    const out = await listFilters({ page: 1, page_size: 25 });
    expect(out.items[0].auto_delete).toBe(1);
    expect(out.items[0].background).toBe(1);
    expect(out.items[1].update_disk_space).toBe(1);
    expect(out.items[1].filter?.where).toMatchObject({ match: 'all' });
  });

  it('getFilter GETs /filters/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/filters/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json(PURGE_WHEN_FULL_ROW);
      }),
    );
    const out = await getFilter(1);
    expect(id).toBe('1');
    expect(out.execute_interval).toBe(60);
  });
});

describe('createFilter / updateFilter / deleteFilter', () => {
  const query: FilterQuery = {
    terms: [{ attr: 'Cause', op: 'LIKE', val: 'Motion' }],
    sort_field: 'StartDateTime', sort_asc: '0', limit: '0', skip_locked: '0',
  };

  it('createFilter POSTs query_json plus the action / option columns', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/filters', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...PURGE_WHEN_FULL_ROW, id: 42, name: 'New' }, { status: 201 });
      }),
    );
    const out = await createFilter({
      name: 'New',
      query_json: serializeFilterQuery(query),
      auto_archive: 1,
      background: 1,
      execute_interval: 120,
    });
    expect(body.name).toBe('New');
    expect(body.query_json).toBe('{"terms":[{"attr":"Cause","op":"LIKE","val":"Motion"}],"sort_field":"StartDateTime","sort_asc":"0","limit":"0","skip_locked":"0"}');
    expect(body.auto_archive).toBe(1);
    expect(body.background).toBe(1);
    expect(body.execute_interval).toBe(120);
    expect(body).not.toHaveProperty('query');
    expect(out.id).toBe(42);
  });

  it('updateFilter PUTs query_json (not "query") and the columns', async () => {
    let body: Record<string, unknown> = {};
    let method: string | undefined;
    server.use(
      http.put('/api/v3/filters/1', async ({ request }) => {
        method = request.method;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(PURGE_WHEN_FULL_ROW);
      }),
    );
    await updateFilter(1, {
      name: 'PurgeWhenFull',
      query_json: PURGE_WHEN_FULL_QUERY_JSON,
      auto_delete: 1,
      auto_unarchive: 0,
      update_disk_space: 0,
      auto_upload: 0,
      auto_copy: 1,
      auto_copy_to: 2,
      background: 1,
      concurrent: 0,
      lock_rows: 1,
      execute_interval: 60,
      email_format: 'Summary',
    });
    expect(method).toBe('PUT');
    expect(body.query_json).toBe(PURGE_WHEN_FULL_QUERY_JSON);
    expect(body).not.toHaveProperty('query');
    expect(body).toMatchObject({
      name: 'PurgeWhenFull',
      auto_delete: 1, auto_unarchive: 0, update_disk_space: 0, auto_upload: 0,
      auto_copy: 1, auto_copy_to: 2, background: 1, concurrent: 0, lock_rows: 1,
      execute_interval: 60, email_format: 'Summary',
    });
  });

  it('deleteFilter DELETEs /filters/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/filters/:id', ({ params }) => {
        id = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await deleteFilter(7);
    expect(id).toBe('7');
  });
});

describe('previewFilter', () => {
  it('POSTs the AST to /filters/preview with page params in the query string', async () => {
    let body: unknown = null;
    let url: URL | undefined;
    server.use(
      http.post('/api/v3/filters/preview', async ({ request }) => {
        url = new URL(request.url);
        body = await request.json();
        return HttpResponse.json({ items: [], total: 0, per_page: 50, current_page: 2, last_page: 0 });
      }),
    );
    const ast = { where: { match: 'all' as const, rules: [{ field: 'archived' as const, op: 'eq' as const, value: 0 }] } };
    const out = await previewFilter(ast, { page: 2, page_size: 50 });
    expect(url?.searchParams.get('page')).toBe('2');
    expect(url?.searchParams.get('page_size')).toBe('50');
    expect(body).toEqual(ast);
    expect(out.current_page).toBe(2);
  });
});
