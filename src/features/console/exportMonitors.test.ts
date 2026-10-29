/**
 * Legacy EXPORT (ajax/console.php `exportMonitorsJSON`): live monitors in
 * Sequence order, instance fields dropped, group names and zones attached.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import type { Monitor } from '@/types';
import type { Zone } from '@/api/zones';
import { useAuthStore } from '@/stores/auth';
import { buildMonitorsExport, fetchMonitorsExport } from './exportMonitors';

const mon = (over: Partial<Monitor>) => ({
  id: 1, name: 'Cam', sequence: 1, server_id: 2, storage_id: 3, zone_count: 1, deleted: false,
  capturing: 'Always', path: 'rtsp://x', ...over,
}) as unknown as Monitor;
const zone = (over: Partial<Zone>) => ({ id: 10, monitor_id: 1, name: 'All', type: 'Active', ...over }) as unknown as Zone;

describe('buildMonitorsExport', () => {
  it('drops instance fields, orders by sequence, skips deleted, attaches groups and zones', () => {
    const doc = buildMonitorsExport({
      version: '1.39.41',
      now: new Date('2026-10-18T12:00:00Z'),
      monitors: [mon({ id: 2, name: 'Back', sequence: 2 }), mon({ id: 1, name: 'Front', sequence: 1 }), mon({ id: 3, deleted: true })],
      zonesByMonitor: { 1: [zone({})] },
      groups: [{ id: 5, name: 'Outside' }],
      groupMonitors: [{ id: 1, group_id: 5, monitor_id: 1 }, { id: 2, group_id: 99, monitor_id: 1 }],
    });
    expect(doc.version).toBe('1.39.41');
    expect(doc.exported).toBe('2026-10-18T12:00:00.000Z');
    expect(doc.monitors.map((m) => m.name)).toEqual(['Front', 'Back']);
    const front = doc.monitors[0];
    for (const k of ['id', 'deleted', 'server_id', 'storage_id', 'sequence', 'zone_count']) expect(front).not.toHaveProperty(k);
    expect(front).toMatchObject({ capturing: 'Always', path: 'rtsp://x', Groups: ['Outside'] });
    expect(front.Zones).toEqual([{ name: 'All', type: 'Active' }]);
    expect(doc.monitors[1]).toMatchObject({ Groups: [], Zones: [] });
  });
});

const paged = (items: unknown[]) => HttpResponse.json({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });
const zoneCalls: string[] = [];
const server = setupServer(
  http.get('/api/v3/monitors', () => paged([mon({ id: 1 }), mon({ id: 4, deleted: true })])),
  http.get('/api/v3/groups', () => paged([])),
  http.get('/api/v3/groups-monitors', () => paged([])),
  http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.39.41', api_version: '3', db_version: '1.39.41' })),
  http.get('/api/v3/monitors/:id/zones', ({ params }) => { zoneCalls.push(String(params.id)); return paged([zone({})]); }),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: null });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

describe('fetchMonitorsExport', () => {
  it('asks for zones of live monitors only', async () => {
    const doc = await fetchMonitorsExport(new Date('2026-10-18T12:00:00Z'));
    expect(zoneCalls).toEqual(['1']);
    expect(doc.monitors).toHaveLength(1);
    expect(doc.monitors[0].Zones).toHaveLength(1);
  });
});
