import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw/http';
import type { JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { listMonitorActions, listMonitorActionTargets, getMonitorAction, createMonitorAction, updateMonitorAction, deleteMonitorAction, runMonitorAction } from './monitorActions';
const server = setupServer();
let seen: Array<{ method: string; url: string; body: unknown }> = [];
/** Answer any route with `reply`, recording method, URL and JSON body. */
function record(reply: JsonBodyType = {}, status = 200) {
  seen = [];
  server.use(http.all('*', async ({ request }) => {
    let body: unknown = null;
    try { body = await request.clone().json(); } catch { /* no body */ }
    seen.push({ method: request.method, url: new URL(request.url).pathname + new URL(request.url).search, body });
    return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(reply, { status });
  }));
}

beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });


describe('monitor actions (zm-api#179)', () => {
  it('lists a monitor\'s actions and the monitors an action can drive', async () => {
    record([]);
    await listMonitorActions(4);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/monitors/4/actions' });
    record([{ id: 2, name: 'Porch', device_class: 'Camera', types: ['LightOn', 'LightOff'] }]);
    const targets = await listMonitorActionTargets(4);
    expect(targets[0].types).toContain('LightOn');
    expect(seen[0].url).toBe('/api/v3/monitors/4/actions/targets');
  });
  it('creates, reads, updates (PATCH), runs and deletes one', async () => {
    record({ id: 11 });
    await createMonitorAction(4, { target_monitor_id: 2, action_type: 'LightOn', trigger_on: 'Alarm' });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v3/monitors/4/actions', body: { target_monitor_id: 2, action_type: 'LightOn', trigger_on: 'Alarm' } });
    record({ id: 11 });
    await getMonitorAction(4, 11);
    expect(seen[0].url).toBe('/api/v3/monitors/4/actions/11');
    record({ id: 11 });
    await updateMonitorAction(4, 11, { enabled: false });
    expect(seen[0]).toMatchObject({ method: 'PATCH', url: '/api/v3/monitors/4/actions/11', body: { enabled: false } });
    record({ success: true, message: 'ok' });
    expect((await runMonitorAction(4, 11)).success).toBe(true);
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v3/monitors/4/actions/11/run' });
    record(null, 204);
    await deleteMonitorAction(4, 11);
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/api/v3/monitors/4/actions/11' });
  });
});
