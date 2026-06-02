import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listFilters,
  getFilter,
  createFilter,
  updateFilter,
  deleteFilter,
  parseFilterQuery,
  serializeFilterQuery,
  type FilterQuery,
} from './filters';
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

describe('parseFilterQuery (pure)', () => {
  it('returns an empty-rules object for null / undefined / empty input', () => {
    expect(parseFilterQuery(null).rules).toEqual([]);
    expect(parseFilterQuery(undefined).rules).toEqual([]);
    expect(parseFilterQuery('').rules).toEqual([]);
  });

  it('falls back to the empty default on malformed JSON instead of throwing', () => {
    const out = parseFilterQuery('not-json');
    expect(out.rules).toEqual([]);
    expect(out.sort).toEqual({ field: 'start_date_time', dir: 'desc' });
  });

  it('drops non-array rules to keep the shape sound', () => {
    const out = parseFilterQuery(JSON.stringify({ rules: 'oops' }));
    expect(out.rules).toEqual([]);
  });

  it('preserves valid rules + sort + limit', () => {
    const q: FilterQuery = {
      rules: [{ field: 'cause', operator: '=', value: 'Motion', conjunction: 'and' }],
      sort: { field: 'id', dir: 'asc' },
      limit: 50,
    };
    const parsed = parseFilterQuery(JSON.stringify(q));
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.sort).toEqual({ field: 'id', dir: 'asc' });
    expect(parsed.limit).toBe(50);
  });
});

describe('parseFilterQuery ⇄ serializeFilterQuery round-trip', () => {
  it('round-trips a non-trivial query unchanged', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'monitor_id', operator: '=', value: '4', conjunction: 'and' },
        { field: 'archived', operator: '!=', value: '1', conjunction: 'and' },
      ],
      sort: { field: 'max_score', dir: 'desc' },
      limit: 100,
    };
    const round = parseFilterQuery(serializeFilterQuery(q));
    expect(round).toEqual(q);
  });

  it('round-trips legacy operators (P19): =~, !~, =[], ![], IS, IS NOT, LIKE, NOT LIKE, >=, <=', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'cause',     operator: '=~',       value: '^Motion',       conjunction: 'and' },
        { field: 'cause',     operator: '!~',       value: '.*spam.*',      conjunction: 'and' },
        { field: 'monitor_id',operator: '=[]',      value: '1,2,3',         conjunction: 'and' },
        { field: 'monitor_id',operator: '![]',      value: '7',             conjunction: 'and' },
        { field: 'notes',     operator: 'IS',       value: 'NULL',          conjunction: 'and' },
        { field: 'notes',     operator: 'IS NOT',   value: 'NULL',          conjunction: 'and' },
        { field: 'name',      operator: 'LIKE',     value: '%cam%',         conjunction: 'and' },
        { field: 'name',      operator: 'NOT LIKE', value: '%test%',        conjunction: 'and' },
        { field: 'max_score', operator: '>=',       value: '50',            conjunction: 'and' },
        { field: 'max_score', operator: '<=',       value: '90',            conjunction: 'and' },
      ],
    };
    const round = parseFilterQuery(serializeFilterQuery(q));
    expect(round.rules).toHaveLength(q.rules.length);
    expect(round.rules.map((r) => r.operator)).toEqual(q.rules.map((r) => r.operator));
  });

  it('round-trips bracket grouping (obr/cbr equivalent)', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'monitor_id', operator: '=', value: '1', conjunction: 'and', bracket_open: 1, bracket_close: 0 },
        { field: 'max_score',  operator: '>', value: '50', conjunction: 'and', bracket_open: 0, bracket_close: 1 },
        { field: 'archived',   operator: '=', value: '0', conjunction: 'or',  bracket_open: 0, bracket_close: 0 },
      ],
    };
    const round = parseFilterQuery(serializeFilterQuery(q));
    expect(round.rules[0].bracket_open).toBe(1);
    expect(round.rules[1].bracket_close).toBe(1);
    expect(round.rules[2].conjunction).toBe('or');
  });

  it('round-trips filter-level options + actions through query_json', () => {
    const q: FilterQuery = {
      rules: [],
      options: { background: true, concurrent: false, lock_rows: true },
      actions: {
        auto_video: true,
        auto_execute: true, auto_execute_cmd: '/bin/echo %EI%',
        auto_email: true, email_to: 'a@b', email_subject: 'subj',
        email_body: 'body', email_format: 'Summary', email_server: 'smtp.local',
        auto_message: false,
        auto_copy: true, auto_copy_to: 2,
        auto_move: true, auto_move_to: 3,
      },
    };
    const round = parseFilterQuery(serializeFilterQuery(q));
    expect(round.options).toEqual(q.options);
    expect(round.actions).toEqual(q.actions);
  });
});

describe('listFilters / getFilter', () => {
  it('listFilters GETs /filters with pagination', async () => {
    server.use(
      http.get('/api/v3/filters', () => HttpResponse.json({
        items: [{ id: 1, name: 'Cars', query_json: '{}', auto_archive: 0, auto_delete: 0, execute_interval: 0 }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listFilters({ page: 1, page_size: 20 });
    expect(out.items[0].name).toBe('Cars');
  });

  it('getFilter GETs /filters/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/filters/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({ id: 9, name: 'Daily', query_json: '{}', auto_archive: 1, auto_delete: 0, execute_interval: 60 });
      }),
    );
    const out = await getFilter(9);
    expect(id).toBe('9');
    expect(out.execute_interval).toBe(60);
  });
});

describe('createFilter / updateFilter / deleteFilter', () => {
  it('createFilter POSTs the payload verbatim', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/filters', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 42, name: 'New', query_json: '{}', auto_archive: 0, auto_delete: 0, execute_interval: 0 });
      }),
    );
    const out = await createFilter({ name: 'New', query_json: '{}' });
    expect(body).toEqual({ name: 'New', query_json: '{}' });
    expect(out.id).toBe(42);
  });

  it('updateFilter PUTs the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.put('/api/v3/filters/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'Renamed', query_json: '{}', auto_archive: 0, auto_delete: 0, execute_interval: 0 });
      }),
    );
    await updateFilter(3, { name: 'Renamed' });
    expect(method).toBe('PUT');
    expect(body).toEqual({ name: 'Renamed' });
  });

  it('deleteFilter DELETEs /filters/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/filters/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteFilter(7);
    expect(id).toBe('7');
  });
});
