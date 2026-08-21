/* TEMPORARY live probe against the dev box — delete before commit. */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'http://192.168.0.45:8080';
(window as unknown as { __ZM_CONFIG__: { apiBase: string } }).__ZM_CONFIG__ = { apiBase: `${BASE}/api/v3` };

const created: number[] = [];

describe('live create probe', () => {
  let createMonitor: typeof import('./monitors-crud').createMonitor;
  let cloneMonitor: typeof import('./monitors-crud').cloneMonitor;
  let patchMonitor: typeof import('./monitors-crud').patchMonitor;
  let del: typeof import('./monitors-crud').deleteMonitor;
  let getMonitor: typeof import('./monitors').getMonitor;
  let DEFAULTS: typeof import('./monitors-crud').MONITOR_CREATE_DEFAULTS;
  let apiPost: typeof import('./client').apiPost;

  beforeAll(async () => {
    const res = await fetch(`${BASE}/api/v3/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'ktx200' }),
    });
    const body = await res.json();
    const { useAuthStore } = await import('@/stores/auth');
    useAuthStore.setState({ accessToken: body.access_token, refreshToken: body.refresh_token, isAuthenticated: true });
    const crud = await import('./monitors-crud');
    createMonitor = crud.createMonitor; cloneMonitor = crud.cloneMonitor;
    patchMonitor = crud.patchMonitor; del = crud.deleteMonitor;
    DEFAULTS = crud.MONITOR_CREATE_DEFAULTS;
    ({ getMonitor } = await import('./monitors'));
    ({ apiPost } = await import('./client'));
  }, 30000);

  it('probes ZoneMinder real defaults field by field', async () => {
    const zmDefaults: Record<string, unknown> = {
      brightness: -1, contrast: -1, hue: -1, colour: -1,
      max_image_buffer_count: 0, stream_replay_buffer: 0, storage_id: 0,
      image_buffer_count: 0,
    };
    for (const [key, value] of Object.entries(zmDefaults)) {
      const payload = { ...DEFAULTS, name: `e2e-probe-${key}`, storage_id: 1, [key]: value };
      try {
        const m = await apiPost<typeof payload, { id: number }>('/monitors', payload);
        created.push(m.id);
        const back = await getMonitor(m.id);
        console.log(`ACCEPT ${key}=${value} -> stored ${JSON.stringify((back as unknown as Record<string, unknown>)[key])}`);
      } catch (e) {
        console.log(`REJECT ${key}=${value} -> ${(e as Error).message}`);
      }
    }
    expect(true).toBe(true);
  }, 120000);

  it('create -> patch -> clone -> delete', async () => {
    const m = await createMonitor({ name: 'e2e-probe-lifecycle', type: 'Ffmpeg', function: 'Monitor', path: 'rtsp://example/x' });
    created.push(m.id);
    console.log('CREATED', m.id, JSON.stringify({ brightness: m.brightness, storage_id: m.storage_id, srb: m.stream_replay_buffer, mibc: m.max_image_buffer_count, deleted: m.deleted }));
    const patched = await patchMonitor(m.id, { notes: 'probe-note' });
    console.log('PATCHED notes=', patched.notes);
    const clone = await cloneMonitor(m.id, 'e2e-probe-clone');
    created.push(clone.id);
    console.log('CLONED', clone.id, JSON.stringify({ brightness: clone.brightness, srb: clone.stream_replay_buffer, mibc: clone.max_image_buffer_count }));
    expect(clone.id).toBeGreaterThan(0);
  }, 120000);

  it('probe secret write-back behaviour', async () => {
    const m = await createMonitor({ name: 'e2e-probe-secret', type: 'Ffmpeg', function: 'Monitor', pass: 'sekrit', user: 'u' });
    created.push(m.id);
    console.log('SECRET create response keys include pass?', 'pass' in (m as object));
    const empty = await patchMonitor(m.id, { pass: '' });
    console.log('PATCH pass="" ok, response pass present?', 'pass' in (empty as object));
    expect(m.id).toBeGreaterThan(0);
  }, 120000);

  it('cleanup', async () => {
    for (const id of created) {
      try { await del(id); console.log('DELETED', id); } catch (e) { console.log('DELETE FAILED', id, (e as Error).message); }
    }
    expect(true).toBe(true);
  }, 120000);
});
