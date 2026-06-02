import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listStates,
  getState,
  createState,
  updateState,
  deleteState,
  applyState,
  changeDaemonState,
  composeDefinition,
  parseDefinition,
} from './states';
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

describe('listStates', () => {
  it('GETs /states with pagination params', async () => {
    let captured = '';
    server.use(
      http.get('/api/v3/states', ({ request }) => {
        captured = request.url;
        return HttpResponse.json({
          items: [
            { id: 1, name: 'default', definition: '1:Always:Always:Always', is_active: 1 },
            { id: 2, name: 'Away',    definition: '1:None:None:None',       is_active: 0 },
          ],
          total: 2, per_page: 200, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await listStates({ page: 1, page_size: 200 });
    expect(captured).toContain('page=1');
    expect(captured).toContain('page_size=200');
    expect(out.items).toHaveLength(2);
    expect(out.items[0].is_active).toBe(1);
  });
});

describe('getState', () => {
  it('GETs /states/{id}', async () => {
    server.use(
      http.get('/api/v3/states/7', () => HttpResponse.json({
        id: 7, name: 'Holiday', definition: '1:None:None:None,2:Always:Always:OnMotion', is_active: 0,
      })),
    );
    const out = await getState(7);
    expect(out.name).toBe('Holiday');
    expect(out.definition).toContain('1:None:None:None');
  });
});

describe('createState', () => {
  it('POSTs the payload to /states', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/states', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 9, name: 'Test', definition: '1:Always:None:None', is_active: 0 }, { status: 201 });
      }),
    );
    const out = await createState({ name: 'Test', definition: '1:Always:None:None', is_active: 0 });
    expect(body).toEqual({ name: 'Test', definition: '1:Always:None:None', is_active: 0 });
    expect(out.id).toBe(9);
  });
});

describe('updateState', () => {
  it('PATCHes /states/{id} with partial payload', async () => {
    let body: unknown = null;
    server.use(
      http.patch('/api/v3/states/3', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'renamed', definition: 'd', is_active: 1 });
      }),
    );
    await updateState(3, { name: 'renamed', is_active: 1 });
    expect(body).toEqual({ name: 'renamed', is_active: 1 });
  });
});

describe('deleteState', () => {
  it('DELETEs /states/{id}', async () => {
    let hits = 0;
    server.use(
      http.delete('/api/v3/states/5', () => {
        hits += 1;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteState(5);
    expect(hits).toBe(1);
  });
});

describe('applyState', () => {
  it('POSTs { state_name } to /system/state', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/system/state', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, message: 'state applied' });
      }),
    );
    const out = await applyState('Away');
    expect(body).toEqual({ state_name: 'Away' });
    expect(out.success).toBe(true);
  });
});

describe('changeDaemonState', () => {
  it('POSTs /states/change/start', async () => {
    let hits = 0;
    server.use(
      http.post('/api/v3/states/change/start', () => {
        hits += 1;
        return HttpResponse.json({ message: 'starting' });
      }),
    );
    const out = await changeDaemonState('start');
    expect(hits).toBe(1);
    expect(out.message).toBe('starting');
  });

  it('POSTs /states/change/restart', async () => {
    let hits = 0;
    server.use(
      http.post('/api/v3/states/change/restart', () => {
        hits += 1;
        return HttpResponse.json({ message: 'restarting' });
      }),
    );
    await changeDaemonState('restart');
    expect(hits).toBe(1);
  });
});

describe('composeDefinition', () => {
  it('joins Id:Capturing:Analysing:Recording triples sorted by id', async () => {
    const out = composeDefinition([
      { id: 2, capturing: 'Always', analysing: 'None',  recording: 'OnMotion' },
      { id: 1, capturing: 'Always', analysing: 'Always', recording: 'Always' },
    ]);
    expect(out).toBe('1:Always:Always:Always,2:Always:None:OnMotion');
  });

  it('returns an empty string when no monitors are provided', () => {
    expect(composeDefinition([])).toBe('');
  });
});

describe('parseDefinition', () => {
  it('parses a well-formed definition string', () => {
    const out = parseDefinition('1:Always:Always:Always,2:None:None:None');
    expect(out).toEqual([
      { id: 1, capturing: 'Always', analysing: 'Always', recording: 'Always' },
      { id: 2, capturing: 'None',   analysing: 'None',   recording: 'None' },
    ]);
  });

  it('skips malformed entries', () => {
    const out = parseDefinition('1:Always:Always:Always,garbage,2:None:None:None');
    expect(out.map((m) => m.id)).toEqual([1, 2]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseDefinition('')).toEqual([]);
    expect(parseDefinition('   ')).toEqual([]);
  });
});
