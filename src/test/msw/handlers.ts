import { http, HttpResponse } from 'msw';

/**
 * Default request handlers used by component tests that need API
 * interaction but mustn't hit the live backend. Individual tests can
 * override these with server.use(...) for negative paths.
 *
 * Shapes intentionally match the real zm_api responses so the tested
 * API client code (which parses .items, .counts, etc.) runs unchanged.
 */
export const handlers = [
  // Auth
  http.post('/api/v3/auth/login', async () => HttpResponse.json({
    access_token: 'test.access.token',
    refresh_token: 'test.refresh.token',
    expire_in: 600,
    token_type: 'Bearer',
  })),
  http.post('/api/v3/auth/refresh', async () => HttpResponse.json({
    access_token: 'test.access.token.refreshed',
    refresh_token: 'test.refresh.token.refreshed',
    expire_in: 600,
    token_type: 'Bearer',
  })),

  // Monitors
  http.get('/api/v3/monitors', () => HttpResponse.json({
    items: [
      { id: 1, name: 'Front Door', width: 1920, height: 1080, orientation: 'Rotate0',  capturing: 'Always', analysing: 'Always', recording: 'OnMotion' },
      { id: 2, name: 'Driveway',   width: 2160, height: 3840, orientation: 'Rotate90', capturing: 'Always', analysing: 'None',   recording: 'None' },
    ],
    total: 2, per_page: 100, current_page: 1, last_page: 1,
  })),

  // Live sessions (always empty — backend bug we documented)
  http.get('/api/v3/live/sessions', () => HttpResponse.json([])),

  // Events
  http.get('/api/v3/events', () => HttpResponse.json({
    items: [], total: 0, per_page: 20, current_page: 1, last_page: 1,
  })),
  http.get('/api/v3/events/counts/:hours', () => HttpResponse.json({
    counts: [], hours: 24,
  })),
  http.get('/api/v3/events/counts-by-monitor/:hours', () => HttpResponse.json({
    counts: [], hours: 24,
  })),

  // System
  http.get('/api/v3/system/status', () => HttpResponse.json({
    running: true,
    daemons: [
      { id: 'zmstats.pl', name: 'zmstats.pl', state: 'running', pid: 1234, uptime_seconds: 3600 },
    ],
    stats: {
      cpu_load: 1.2, cpu_usage_percent: 15.3,
      total_mem: 16e9, free_mem: 8e9,
      total_swap: 4e9, free_swap: 4e9,
      total_disk: 1e12, used_disk: 5e11, free_disk: 5e11, disk_usage_percent: 50,
    },
  })),
  http.get('/api/v3/host/getVersion', () => HttpResponse.json({
    version: '1.39.10', api_version: '3.0.0', db_version: '1.39.10',
  })),
  http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
];
