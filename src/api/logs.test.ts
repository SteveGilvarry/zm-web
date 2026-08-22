import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  clearLogs, getLog, isLogMinLevel, levelColor, levelLabel, levelRowTint, listLogs,
} from './logs';
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

// ZoneMinder's Logger scale, as written to the Logs table on a live box:
// level -1 rows carry code WAR and level 0 rows carry INF.
describe('levelLabel (pure)', () => {
  it('maps ZoneMinder severity numbers to labels', () => {
    expect(levelLabel(-4)).toBe('PANIC');
    expect(levelLabel(-3)).toBe('FATAL');
    expect(levelLabel(-2)).toBe('ERROR');
    expect(levelLabel(-1)).toBe('WARNING');
    expect(levelLabel(0)).toBe('INFO');
    expect(levelLabel(1)).toBe('DEBUG');
  });

  it('labels deeper debug levels and anything below PANIC sensibly', () => {
    expect(levelLabel(7)).toBe('DEBUG 7');
    expect(levelLabel(-99)).toBe('PANIC');
  });
});

describe('levelColor / levelRowTint (pure)', () => {
  it('maps ERROR and worse to crimson', () => {
    expect(levelColor(-4)).toBe('text-crimson');
    expect(levelColor(-3)).toBe('text-crimson');
    expect(levelColor(-2)).toBe('text-crimson');
  });

  it('maps WARNING/INFO to amber/cyan and DEBUG to muted', () => {
    expect(levelColor(-1)).toBe('text-amber');
    expect(levelColor(0)).toBe('text-cyan');
    expect(levelColor(1)).toBe('text-text-muted');
    expect(levelColor(5)).toBe('text-text-muted');
  });

  it('tints rows for WARNING and worse only', () => {
    expect(levelRowTint(-3)).toBe('bg-crimson/20');
    expect(levelRowTint(-2)).toBe('bg-crimson/10');
    expect(levelRowTint(-1)).toBe('bg-amber/10');
    expect(levelRowTint(0)).toBe('');
    expect(levelRowTint(1)).toBe('');
  });
});

describe('isLogMinLevel (pure)', () => {
  it('accepts only the names the backend enum takes', () => {
    for (const name of ['fatal', 'error', 'warning', 'info', 'debug']) {
      expect(isLogMinLevel(name)).toBe(true);
    }
    // There is no `panic` variant — `fatal` already covers PANIC and below.
    expect(isLogMinLevel('panic')).toBe(false);
    expect(isLogMinLevel(-2)).toBe(false);
  });
});

describe('listLogs', () => {
  it('GETs /logs with every filter zm-api#21 added', async () => {
    let params = new URLSearchParams();
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({
          items: [{ id: 1, time_key: 't', level: 1, code: 'INF', component: 'zmc', message: 'hi' }],
          total: 1, per_page: 20, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await listLogs({
      component: 'zmc', min_level: 'error', search: 'boom',
      start: 1780000000, end: 1780000900, sort: 'asc', server_id: 2,
    });
    expect(params.get('component')).toBe('zmc');
    expect(params.get('min_level')).toBe('error');
    expect(params.get('search')).toBe('boom');
    expect(params.get('start')).toBe('1780000000');
    expect(params.get('end')).toBe('1780000900');
    expect(params.get('sort')).toBe('asc');
    expect(params.get('server_id')).toBe('2');
    expect(out.items[0].component).toBe('zmc');
  });
});

describe('clearLogs', () => {
  it('DELETEs /logs with the same filters and returns the count message', async () => {
    let params: URLSearchParams | null = null;
    server.use(
      http.delete('/api/v3/logs', ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ message: 'Deleted 12 log entries' });
      }),
    );
    const out = await clearLogs({ component: 'zmc', min_level: 'warning', search: 'boom' });
    expect(out.message).toBe('Deleted 12 log entries');
    expect(params!.get('component')).toBe('zmc');
    expect(params!.get('min_level')).toBe('warning');
    expect(params!.get('search')).toBe('boom');
  });

  it('sends no query string at all when nothing is filtered', async () => {
    let url = '';
    server.use(
      http.delete('/api/v3/logs', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ message: 'Deleted 900 log entries' });
      }),
    );
    await clearLogs();
    expect(url).not.toContain('?');
  });
});

describe('getLog', () => {
  it('GETs /logs/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.get('/api/v3/logs/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({
          id: 42, time_key: 't', level: -2, code: 'ERR', component: 'zma', message: 'boom',
        });
      }),
    );
    const out = await getLog(42);
    expect(id).toBe('42');
    expect(out.level).toBe(-2);
  });
});
