import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  getVersion,
  getDaemons,
  getDaemon,
  startDaemon,
  stopDaemon,
  restartDaemon,
  getSystemStatus,
  systemStartup,
  systemShutdown,
  systemRestart,
  getServerStats,
  getHealthCheck,
  systemLogRotate,
} from './system';
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

describe('getVersion', () => {
  it('GETs /host/getVersion and returns the shape verbatim', async () => {
    server.use(
      http.get('/api/v3/host/getVersion', () =>
        HttpResponse.json({ version: '1.36.0', api_version: '3.0', db_version: '1.36.0' }),
      ),
    );
    const out = await getVersion();
    expect(out.version).toBe('1.36.0');
    expect(out.api_version).toBe('3.0');
  });
});

describe('getDaemons / getDaemon', () => {
  it('getDaemons returns the wrapper with .daemons array', async () => {
    server.use(
      http.get('/api/v3/daemons', () =>
        HttpResponse.json({ daemons: [{ name: 'zmc', running: true }] }),
      ),
    );
    const out = await getDaemons();
    expect(out.daemons).toHaveLength(1);
  });

  it('getDaemon GETs /daemons/{name}', async () => {
    let receivedName: string | undefined;
    server.use(
      http.get('/api/v3/daemons/:name', ({ params }) => {
        receivedName = params.name as string;
        return HttpResponse.json({ name: 'zmc', running: true });
      }),
    );
    const out = await getDaemon('zmc');
    expect(receivedName).toBe('zmc');
    expect(out.running).toBe(true);
  });
});

describe('startDaemon / stopDaemon / restartDaemon', () => {
  it('startDaemon POSTs /daemons/{name}/start', async () => {
    let url = '';
    server.use(
      http.post('/api/v3/daemons/zma/start', ({ request }) => {
        url = request.url;
        return HttpResponse.json({});
      }),
    );
    await startDaemon('zma');
    expect(url).toContain('/api/v3/daemons/zma/start');
  });

  it('stopDaemon POSTs /daemons/{name}/stop', async () => {
    let hit = false;
    server.use(
      http.post('/api/v3/daemons/zma/stop', () => {
        hit = true;
        return HttpResponse.json({});
      }),
    );
    await stopDaemon('zma');
    expect(hit).toBe(true);
  });

  it('restartDaemon POSTs /daemons/{name}/restart', async () => {
    let hit = false;
    server.use(
      http.post('/api/v3/daemons/zma/restart', () => {
        hit = true;
        return HttpResponse.json({});
      }),
    );
    await restartDaemon('zma');
    expect(hit).toBe(true);
  });
});

describe('getSystemStatus / systemStartup / systemShutdown / systemRestart / systemLogRotate', () => {
  it('getSystemStatus returns running + stats', async () => {
    server.use(
      http.get('/api/v3/system/status', () =>
        HttpResponse.json({
          running: true,
          daemons: ['zmc'],
          stats: {
            cpu_load: 0.5, cpu_usage_percent: 12,
            total_mem: 1, free_mem: 1, total_swap: 0, free_swap: 0,
            total_disk: 10, used_disk: 4, free_disk: 6, disk_usage_percent: 40,
          },
        }),
      ),
    );
    const out = await getSystemStatus();
    expect(out.running).toBe(true);
    expect(out.stats?.disk_usage_percent).toBe(40);
  });

  it('systemStartup / systemShutdown / systemRestart / systemLogRotate POST their respective endpoints', async () => {
    const hits: string[] = [];
    server.use(
      http.post('/api/v3/system/startup', () => { hits.push('startup'); return HttpResponse.json({}); }),
      http.post('/api/v3/system/shutdown', () => { hits.push('shutdown'); return HttpResponse.json({}); }),
      http.post('/api/v3/system/restart', () => { hits.push('restart'); return HttpResponse.json({}); }),
      http.post('/api/v3/system/log_rotate', () => { hits.push('log_rotate'); return HttpResponse.json({}); }),
    );
    await systemStartup();
    await systemShutdown();
    await systemRestart();
    await systemLogRotate();
    expect(hits).toEqual(['startup', 'shutdown', 'restart', 'log_rotate']);
  });
});

describe('getServerStats / getHealthCheck', () => {
  it('getServerStats returns the raw array', async () => {
    server.use(
      http.get('/api/v3/server-stats', () =>
        HttpResponse.json([{ id: 1, timestamp: '2026-06-02T00:00:00Z' }]),
      ),
    );
    const out = await getServerStats();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it('getHealthCheck returns {status}', async () => {
    server.use(
      http.get('/api/v3/server/health_check', () =>
        HttpResponse.json({ status: 'ok' }),
      ),
    );
    const out = await getHealthCheck();
    expect(out.status).toBe('ok');
  });
});
