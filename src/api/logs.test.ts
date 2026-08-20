import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { listLogs, getLog, levelLabel, levelColor, levelRowTint } from './logs';
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

describe('listLogs', () => {
  it('GETs /logs with level + component filters', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [{ id: 1, time_key: 't', level: 1, code: 'INF', component: 'zmc', message: 'hi' }],
          total: 1, per_page: 20, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await listLogs({ level: -1, component: 'zmc' });
    expect(capturedUrl).toContain('level=-1');
    expect(capturedUrl).toContain('component=zmc');
    expect(out.items[0].component).toBe('zmc');
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
