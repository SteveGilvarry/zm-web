import { http, HttpResponse, type HttpHandler } from 'msw';

import { useAuthStore } from '@/stores/auth';
import { PERM_FEATURES } from '@/features/auth/perms';

import type { Monitor, PaginatedResponse, User, ZmConfig, ZmEvent, ZmStorage } from '@/types';
import type { Control } from '@/api/controls';
import type { Filter } from '@/api/filters';
import type { Frame } from '@/api/frames';
import type { Group, GroupMonitor } from '@/api/groups';
import type { LogEntry } from '@/api/logs';
import type { MonitorStatusRecord } from '@/api/monitorStatus';
import type { MontageLayout } from '@/api/montageLayouts';
import type { Report } from '@/api/reports';
import type { Server } from '@/api/servers';
import type { State } from '@/api/states';
import type { Tag } from '@/api/tags';
import type { Zone } from '@/api/zones';

import {
  makeConfig,
  makeControl,
  makeEvent,
  makeFilter,
  makeFrame,
  makeGroup,
  makeGroupMonitor,
  makeLog,
  makeMonitor,
  makeMonitorStatus,
  makeMontageLayout,
  makePtzCapabilities,
  makePtzStatus,
  makeReport,
  makeServer,
  makeServerStat,
  makeState,
  makeStorage,
  makeSystemStatus,
  makeTag,
  makeUser,
  makeVersion,
  makeZone,
  paginated,
  type SystemStatusFixture,
} from '../fixtures';

/**
 * The default API the component and route tests run against.
 *
 * Two things make this more than a pile of stubs:
 *
 *  1. Every response body comes from `../fixtures`, which is schema-checked
 *     against the OpenAPI snapshot. A handler cannot quietly invent a shape.
 *  2. There is an in-memory store (`db`), so writes round-trip: a test can
 *     POST a group and then see it in the next GET, which is what a page's
 *     "create then invalidate then refetch" flow actually does.
 *
 * `server.use(...)` still overrides any of it per test — that is the way to
 * drive error and empty states. `resetDb()` runs between tests via
 * `setupMockServer()`, so mutations never leak.
 */

/* ------------------------------------------------------------------------ */
/*  Store                                                                   */
/* ------------------------------------------------------------------------ */

export interface MockDb {
  monitors: Monitor[];
  monitorStatuses: MonitorStatusRecord[];
  events: ZmEvent[];
  frames: Frame[];
  tags: Tag[];
  eventTags: Array<{ event_id: number; tag_id: number }>;
  zones: Zone[];
  controls: Control[];
  groups: Group[];
  groupMonitors: GroupMonitor[];
  filters: Filter[];
  logs: LogEntry[];
  configs: ZmConfig[];
  storage: ZmStorage[];
  servers: Server[];
  states: State[];
  reports: Report[];
  users: User[];
  montageLayouts: MontageLayout[];
  systemStatus: SystemStatusFixture;
}

/** Two monitors, three events: enough for "renders a list" without noise. */
function seed(): MockDb {
  return {
    monitors: [
      makeMonitor({ id: 1, name: 'Front Door', sequence: 1 }),
      makeMonitor({
        id: 2,
        name: 'Driveway',
        sequence: 2,
        width: 2160,
        height: 3840,
        orientation: 'Rotate90',
        analysing: 'None',
        recording: 'None',
        controllable: 1,
        control_id: 1,
      }),
    ],
    monitorStatuses: [
      makeMonitorStatus({ monitor_id: 1, status: 'Connected' }),
      makeMonitorStatus({ monitor_id: 2, status: 'NotRunning', capture_fps: '0.00' }),
    ],
    events: [
      makeEvent({ id: 101, monitor_id: 1, name: 'Event-101', cause: 'Motion' }),
      makeEvent({
        id: 102,
        monitor_id: 2,
        name: 'Event-102',
        cause: 'Forced Web',
        archived: 1,
        length: '12.50',
        max_score: 12,
      }),
      makeEvent({ id: 103, monitor_id: 1, name: 'Event-103', notes: 'delivery van' }),
    ],
    frames: [
      makeFrame({ id: 1, event_id: 101, frame_id: 1, delta: '0.00' }),
      makeFrame({ id: 2, event_id: 101, frame_id: 2, type: 'Alarm', score: 88, delta: '1.00' }),
    ],
    tags: [makeTag({ id: 1, name: 'Important' })],
    eventTags: [],
    zones: [makeZone({ id: 1, monitor_id: 1 })],
    controls: [makeControl({ id: 1 })],
    groups: [
      makeGroup({ id: 1, name: 'Outdoor' }),
      makeGroup({ id: 2, name: 'Front Yard', parent_id: 1 }),
    ],
    groupMonitors: [makeGroupMonitor({ id: 1, group_id: 1, monitor_id: 1 })],
    filters: [makeFilter({ id: 1 })],
    logs: [
      makeLog({ id: 1 }),
      makeLog({ id: 2, level: -2, code: 'ERR', component: 'zma_m1', message: 'Shared data size conflict' }),
    ],
    configs: [
      makeConfig({ id: 1, name: 'ZM_WEB_TITLE', value: 'ZoneMinder', category: 'web' }),
      makeConfig({
        id: 2,
        name: 'ZM_OPT_USE_AUTH',
        value: 'yes',
        type: 'boolean',
        category: 'system',
        hint: 'yes|no',
      }),
    ],
    storage: [makeStorage({ id: 1 })],
    servers: [makeServer({ id: 1 })],
    states: [
      makeState({ id: 1, name: 'default', is_active: 1 }),
      makeState({ id: 2, name: 'away', is_active: 0, definition: '1:Always:Always:Always' }),
    ],
    reports: [makeReport({ id: 1 })],
    users: [makeUser({ id: 1 })],
    montageLayouts: [makeMontageLayout({ id: 1 })],
    systemStatus: makeSystemStatus(),
  };
}

export let db: MockDb = seed();

/** Restore the store to its seed, optionally patching parts of it. */
export function resetDb(patch: Partial<MockDb> = {}): MockDb {
  db = { ...seed(), ...patch };
  return db;
}

/* ------------------------------------------------------------------------ */
/*  Helpers                                                                 */
/* ------------------------------------------------------------------------ */

const API = '/api/v3';

function num(value: string | null): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Apply `page` / `page_size` from the query string and wrap in the envelope. */
function pageOf<T>(request: Request, rows: T[]): PaginatedResponse<T> {
  const url = new URL(request.url);
  const perPage = num(url.searchParams.get('page_size')) ?? 100;
  const current = num(url.searchParams.get('page')) ?? 1;
  const start = (current - 1) * perPage;
  return paginated(rows.slice(start, start + perPage), {
    total: rows.length,
    per_page: perPage,
    current_page: current,
  });
}

function nextId(rows: Array<{ id: number }>): number {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

const notFound = () =>
  HttpResponse.json({ error_message: 'Not found', code: 404 }, { status: 404 });

/** CRUD handlers for a `/resource` + `/resource/{id}` pair backed by `db`. */
function crud<T extends { id: number }>(
  path: string,
  select: () => T[],
  make: (body: Record<string, unknown>, id: number) => T,
  options: { update?: 'PATCH' | 'PUT' } = {},
): HttpHandler[] {
  const updateVerb = options.update ?? 'PATCH';
  const update = http[updateVerb === 'PUT' ? 'put' : 'patch'];
  return [
    http.get(`${API}${path}`, ({ request }) => HttpResponse.json(pageOf(request, select()))),
    http.get(`${API}${path}/:id`, ({ params }) => {
      const row = select().find((r) => r.id === Number(params.id));
      return row ? HttpResponse.json(row) : notFound();
    }),
    http.post(`${API}${path}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const row = make(body, nextId(select()));
      select().push(row);
      return HttpResponse.json(row, { status: 201 });
    }),
    update(`${API}${path}/:id`, async ({ request, params }) => {
      const rows = select();
      const i = rows.findIndex((r) => r.id === Number(params.id));
      if (i < 0) return notFound();
      const body = (await request.json()) as Partial<T>;
      rows[i] = { ...rows[i], ...body };
      return HttpResponse.json(rows[i]);
    }),
    http.delete(`${API}${path}/:id`, ({ params }) => {
      const rows = select();
      const i = rows.findIndex((r) => r.id === Number(params.id));
      if (i < 0) return notFound();
      rows.splice(i, 1);
      return HttpResponse.json({ message: 'deleted' });
    }),
  ];
}

/* ------------------------------------------------------------------------ */
/*  Handlers                                                                */
/* ------------------------------------------------------------------------ */

const auth: HttpHandler[] = [
  http.post(`${API}/auth/login`, () =>
    HttpResponse.json({
      access_token: 'test.access.token',
      refresh_token: 'test.refresh.token',
      expire_in: 600,
      token_type: 'Bearer',
    }),
  ),
  http.post(`${API}/auth/refresh`, () =>
    HttpResponse.json({
      access_token: 'test.access.token.refreshed',
      refresh_token: 'test.refresh.token.refreshed',
      expire_in: 600,
      token_type: 'Bearer',
    }),
  ),
  http.post(`${API}/auth/logout`, () => HttpResponse.json({ message: 'ok' })),
  // The signed-in operator. A real backend and the token it issued agree
  // about permissions, so this mirrors the test's `perms` claim rather than
  // handing back the seed row — otherwise every permission-gating test would
  // have `/me` quietly promote its restricted operator to admin.
  http.get(`${API}/me`, () => {
    const claims = useAuthStore.getState().user;
    const row = { ...db.users[0] };
    if (claims?.uid != null) row.id = claims.uid;
    if (claims?.user) row.username = claims.user;
    if (claims?.perms) {
      for (const feature of PERM_FEATURES) row[feature] = claims.perms[feature] ?? 'None';
    }
    // The wrapped `MeResponse` the current backend returns. The flat
    // `UserResponse` older builds sent is covered in src/api/me.test.ts.
    return HttpResponse.json({
      user: row,
      issued_at: '2026-08-22T00:00:00Z',
      expires_at: '2026-08-22T00:10:00Z',
      token_type: 'Bearer',
    });
  }),
  http.put(`${API}/me/password`, () =>
    HttpResponse.json({ message: 'Password changed; please sign in again' })),
];

const monitors: HttpHandler[] = [
  http.get(`${API}/monitors`, ({ request }) => HttpResponse.json(pageOf(request, db.monitors))),
  http.get(`${API}/monitors/:id/zones`, ({ request, params }) =>
    HttpResponse.json(
      pageOf(request, db.zones.filter((z) => z.monitor_id === Number(params.id))),
    ),
  ),
  http.post(`${API}/monitors/:id/zones`, async ({ request, params }) => {
    const body = (await request.json()) as Partial<Zone>;
    const zone = makeZone({ ...body, id: nextId(db.zones), monitor_id: Number(params.id) });
    db.zones.push(zone);
    return HttpResponse.json(zone, { status: 201 });
  }),
  // An ArrayBuffer, not a Blob: Node 22's undici rejects jsdom's Blob when it
  // builds the response body (`TypeError: object.stream is not a function`),
  // so the handler 500s and the download path never runs. Node 24 accepts it,
  // which is why this only ever failed on CI — .nvmrc pins 22.
  http.get(`${API}/monitors/:id/snapshot`, () =>
    HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    })),
  http.get(`${API}/monitors/:id`, ({ params }) => {
    const monitor = db.monitors.find((m) => m.id === Number(params.id));
    return monitor ? HttpResponse.json(monitor) : notFound();
  }),
  http.post(`${API}/monitors`, async ({ request }) => {
    const body = (await request.json()) as Partial<Monitor>;
    const monitor = makeMonitor({ ...body, id: nextId(db.monitors) });
    db.monitors.push(monitor);
    return HttpResponse.json(monitor, { status: 201 });
  }),
  http.patch(`${API}/monitors/:id/alarm`, ({ params }) => {
    const monitor = db.monitors.find((m) => m.id === Number(params.id));
    return monitor ? HttpResponse.json(monitor) : notFound();
  }),
  http.patch(`${API}/monitors/:id`, async ({ request, params }) => {
    const i = db.monitors.findIndex((m) => m.id === Number(params.id));
    if (i < 0) return notFound();
    db.monitors[i] = { ...db.monitors[i], ...((await request.json()) as Partial<Monitor>) };
    return HttpResponse.json(db.monitors[i]);
  }),
  http.delete(`${API}/monitors/:id`, ({ params }) => {
    db.monitors = db.monitors.filter((m) => m.id !== Number(params.id));
    return HttpResponse.json({ message: 'deleted' });
  }),
  http.get(`${API}/monitor-status`, ({ request }) =>
    HttpResponse.json(pageOf(request, db.monitorStatuses)),
  ),
  http.get(`${API}/monitor-status/:id`, ({ params }) => {
    const row = db.monitorStatuses.find((s) => s.monitor_id === Number(params.id));
    return row ? HttpResponse.json(row) : notFound();
  }),
  http.get(`${API}/monitors-permissions`, ({ request }) => HttpResponse.json(pageOf(request, []))),
  http.post(`${API}/monitors-permissions`, async ({ request }) =>
    HttpResponse.json({ id: 1, ...((await request.json()) as object) }, { status: 201 }),
  ),
  http.patch(`${API}/monitors-permissions/:id`, () => HttpResponse.json({ message: 'ok' })),
  http.delete(`${API}/monitors-permissions/:id`, () => HttpResponse.json({ message: 'ok' })),
  http.put(`${API}/zones/:id`, async ({ request, params }) => {
    const i = db.zones.findIndex((z) => z.id === Number(params.id));
    if (i < 0) return notFound();
    db.zones[i] = { ...db.zones[i], ...((await request.json()) as Partial<Zone>) };
    return HttpResponse.json(db.zones[i]);
  }),
  http.delete(`${API}/zones/:id`, ({ params }) => {
    db.zones = db.zones.filter((z) => z.id !== Number(params.id));
    return HttpResponse.json({ message: 'deleted' });
  }),
  http.get(`${API}/zone-presets`, ({ request }) =>
    HttpResponse.json(
      pageOf(request, [
        { id: 1, name: 'Default', type: 'Active', units: 'Percent', check_method: 'Blobs' },
      ]),
    ),
  ),
  http.get(`${API}/monitor_presets`, ({ request }) => HttpResponse.json(pageOf(request, []))),
  http.get(`${API}/control_presets`, ({ request }) =>
    HttpResponse.json(
      pageOf(request, [{ monitor_id: 2, preset: 1, label: 'Gate' }]),
    ),
  ),
  http.get(`${API}/manufacturers`, ({ request }) =>
    HttpResponse.json(pageOf(request, [{ id: 1, name: 'Hikvision' }])),
  ),
  http.post(`${API}/manufacturers`, async ({ request }) =>
    HttpResponse.json({ id: 2, ...((await request.json()) as object) }, { status: 201 }),
  ),
  http.get(`${API}/models`, ({ request }) =>
    HttpResponse.json(pageOf(request, [{ id: 1, name: 'DS-2CD', manufacturer_id: 1 }])),
  ),
  http.post(`${API}/models`, async ({ request }) =>
    HttpResponse.json({ id: 2, ...((await request.json()) as object) }, { status: 201 }),
  ),
  http.post(`${API}/discovery/probe`, () => HttpResponse.json({ cameras: [] })),
  http.post(`${API}/discovery/inspect`, () => HttpResponse.json({ profiles: [] })),
];

const live: HttpHandler[] = [
  http.get(`${API}/live/sessions`, () => HttpResponse.json([])),
  http.post(`${API}/live/:id/start`, ({ params }) =>
    HttpResponse.json({
      monitor_id: Number(params.id),
      status: 'started',
      hls_playlist: `/api/v3/live/${params.id}/hls/master.m3u8`,
      webrtc_signaling: `/api/v3/live/${params.id}/webrtc/ws`,
    }),
  ),
  http.post(`${API}/live/:id/stop`, () => HttpResponse.json({ message: 'stopped' })),
  http.get(`${API}/live/:id/stats`, ({ params }) =>
    HttpResponse.json({
      monitor_id: Number(params.id),
      status: 'running',
      packets_processed: 100,
      errors: 0,
      uptime_seconds: 12.5,
      protocols: {},
    }),
  ),
  http.get(`${API}/live/:id/hls/master.m3u8`, () => new HttpResponse('#EXTM3U')),
];

const events: HttpHandler[] = [
  http.get(`${API}/events`, ({ request }) => {
    const url = new URL(request.url);
    const monitorId = num(url.searchParams.get('monitor_id'));
    const like = (haystack: string | null | undefined, needle: string | null) =>
      !needle || (haystack ?? '').toLowerCase().includes(needle.toLowerCase());
    const tagIds = (url.searchParams.get('tag_id') ?? '')
      .split(',').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
    let rows = monitorId ? db.events.filter((e) => e.monitor_id === monitorId) : db.events;
    // Mirror zm-api#20: case-insensitive substring on name/cause/notes and
    // "any of these tags" on tag_id.
    rows = rows.filter((e) =>
      like(e.name, url.searchParams.get('name')) &&
      like(e.cause, url.searchParams.get('cause')) &&
      like(e.notes, url.searchParams.get('notes')) &&
      (tagIds.length === 0 || (e.tags ?? []).some((t) => tagIds.includes(t.id))));
    return HttpResponse.json(pageOf(request, rows));
  }),
  http.get(`${API}/events/counts/:hours`, ({ params }) =>
    HttpResponse.json({
      counts: [{ date: '2026-08-21T09:00:00', count: db.events.length }],
      hours: Number(params.hours),
    }),
  ),
  http.get(`${API}/events/counts-by-monitor/:hours`, ({ params }) =>
    HttpResponse.json({
      counts: db.monitors.map((m) => ({
        monitor_id: m.id,
        count: db.events.filter((e) => e.monitor_id === m.id).length,
      })),
      hours: Number(params.hours),
    }),
  ),
  http.get(`${API}/events/:id/info`, ({ params }) =>
    HttpResponse.json({ event_id: Number(params.id), has_video: true, duration: 600 }),
  ),
  // ArrayBuffer bodies for the same reason as /monitors/:id/snapshot above.
  http.get(`${API}/events/:id/thumbnail`, () =>
    HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    })),
  http.get(`${API}/events/:id/video`, () =>
    HttpResponse.arrayBuffer(new Uint8Array([0x00, 0x00, 0x00, 0x18]).buffer, {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' },
    })),
  http.get(`${API}/events/:id`, ({ params }) => {
    const event = db.events.find((e) => e.id === Number(params.id));
    return event ? HttpResponse.json(event) : notFound();
  }),
  http.patch(`${API}/events/:id`, async ({ request, params }) => {
    const i = db.events.findIndex((e) => e.id === Number(params.id));
    if (i < 0) return notFound();
    db.events[i] = { ...db.events[i], ...((await request.json()) as Partial<ZmEvent>) };
    return HttpResponse.json(db.events[i]);
  }),
  http.delete(`${API}/events/:id`, ({ params }) => {
    db.events = db.events.filter((e) => e.id !== Number(params.id));
    return HttpResponse.json({ message: 'deleted' });
  }),
  http.get(`${API}/frames`, ({ request }) => {
    const eventId = num(new URL(request.url).searchParams.get('event_id'));
    const rows = eventId ? db.frames.filter((f) => f.event_id === eventId) : db.frames;
    return HttpResponse.json(pageOf(request, rows));
  }),
  http.get(`${API}/event-data`, ({ request }) => HttpResponse.json(pageOf(request, []))),
  http.get(`${API}/event-summaries`, ({ request }) => HttpResponse.json(pageOf(request, []))),
  http.get(`${API}/event-summaries/:id`, ({ params }) =>
    HttpResponse.json({
      monitor_id: Number(params.id),
      total_events: 3, total_event_disk_space: 41943040,
      hour_events: 1, hour_event_disk_space: 1048576,
      day_events: 3, day_event_disk_space: 41943040,
      week_events: 3, week_event_disk_space: 41943040,
      month_events: 3, month_event_disk_space: 41943040,
      archived_events: 1, archived_event_disk_space: 1048576,
    }),
  ),
  http.get(`${API}/tags`, ({ request }) => HttpResponse.json(pageOf(request, db.tags))),
  http.post(`${API}/tags`, async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const tag = makeTag({ id: nextId(db.tags), name: body.name, event_count: 0 });
    db.tags.push(tag);
    return HttpResponse.json(tag, { status: 201 });
  }),
  http.get(`${API}/tags/:id`, ({ params }) => {
    const tag = db.tags.find((t) => t.id === Number(params.id));
    if (!tag) return notFound();
    return HttpResponse.json({
      ...tag, events: [], total_events: 0, per_page: 20, current_page: 1, last_page: 1,
    });
  }),
  http.delete(`${API}/tags/:id`, ({ params }) => {
    db.tags = db.tags.filter((t) => t.id !== Number(params.id));
    return HttpResponse.json({ message: 'deleted' });
  }),
  http.post(`${API}/events-tags/:tagId/:eventId`, ({ params }) => {
    db.eventTags.push({ tag_id: Number(params.tagId), event_id: Number(params.eventId) });
    return HttpResponse.json({ message: 'ok' }, { status: 201 });
  }),
  http.delete(`${API}/events-tags/:tagId/:eventId`, ({ params }) => {
    db.eventTags = db.eventTags.filter(
      (t) => !(t.tag_id === Number(params.tagId) && t.event_id === Number(params.eventId)),
    );
    return HttpResponse.json({ message: 'ok' });
  }),
];

const groups: HttpHandler[] = [
  http.get(`${API}/groups`, ({ request }) => HttpResponse.json(pageOf(request, db.groups))),
  http.get(`${API}/groups/:id`, ({ params }) => {
    const group = db.groups.find((g) => g.id === Number(params.id));
    return group ? HttpResponse.json(group) : notFound();
  }),
  http.post(`${API}/groups`, async ({ request }) => {
    const body = (await request.json()) as Partial<Group>;
    const group = makeGroup({ ...body, id: nextId(db.groups) });
    db.groups.push(group);
    return HttpResponse.json(group, { status: 201 });
  }),
  http.patch(`${API}/groups/:id`, async ({ request, params }) => {
    const i = db.groups.findIndex((g) => g.id === Number(params.id));
    if (i < 0) return notFound();
    db.groups[i] = { ...db.groups[i], ...((await request.json()) as Partial<Group>) };
    return HttpResponse.json(db.groups[i]);
  }),
  http.delete(`${API}/groups/:id`, ({ params }) => {
    db.groups = db.groups.filter((g) => g.id !== Number(params.id));
    return HttpResponse.json({ message: 'deleted' });
  }),
  http.get(`${API}/groups-monitors`, ({ request }) =>
    HttpResponse.json(pageOf(request, db.groupMonitors)),
  ),
  http.post(`${API}/groups-monitors`, async ({ request }) => {
    const body = (await request.json()) as Partial<GroupMonitor>;
    const row = makeGroupMonitor({ ...body, id: nextId(db.groupMonitors) });
    db.groupMonitors.push(row);
    return HttpResponse.json(row, { status: 201 });
  }),
  http.delete(`${API}/groups-monitors/:id`, ({ params }) => {
    db.groupMonitors = db.groupMonitors.filter((r) => r.id !== Number(params.id));
    return HttpResponse.json({ message: 'deleted' });
  }),
  http.get(`${API}/groups-permissions`, ({ request }) => HttpResponse.json(pageOf(request, []))),
  http.post(`${API}/groups-permissions`, async ({ request }) =>
    HttpResponse.json({ id: 1, ...((await request.json()) as object) }, { status: 201 }),
  ),
  http.patch(`${API}/groups-permissions/:id`, () => HttpResponse.json({ message: 'ok' })),
  http.delete(`${API}/groups-permissions/:id`, () => HttpResponse.json({ message: 'ok' })),
];

/**
 * A `GET /configs` handler for tests that need specific `ZM_*` values.
 *
 * `useZmConfig` reads the whole table through one shared query rather than
 * fetching each row — a page reading five settings used to make five round
 * trips, which trips zm-api's rate limiter on a real box. Tests therefore
 * override the *list*, not `/configs/:name`.
 *
 * Overrides are merged over the seeded rows, so naming one value does not
 * blank the rest of the table the way replacing the list wholesale would.
 */
export function configListHandler(overrides: Record<string, string>): HttpHandler {
  return http.get(`${API}/configs`, ({ request }) => {
    const rows = db.configs.map((c) =>
      c.name in overrides ? { ...c, value: overrides[c.name] } : c,
    );
    for (const [name, value] of Object.entries(overrides)) {
      if (!rows.some((r) => r.name === name)) {
        rows.push({
          id: rows.length + 1, name, value,
          type: 'string', category: 'web', readonly: 0, private: 0, system: 0,
        } as (typeof db.configs)[number]);
      }
    }
    return HttpResponse.json(pageOf(request, rows));
  });
}

const configs: HttpHandler[] = [
  http.get(`${API}/configs/categories`, () =>
    HttpResponse.json(
      [...new Set(db.configs.map((c) => c.category))].map((category) => ({
        category,
        count: db.configs.filter((c) => c.category === category).length,
      })),
    ),
  ),
  http.get(`${API}/configs`, ({ request }) => {
    const category = new URL(request.url).searchParams.get('category');
    const rows = category ? db.configs.filter((c) => c.category === category) : db.configs;
    return HttpResponse.json(pageOf(request, rows));
  }),
  http.get(`${API}/configs/:name`, ({ params }) => {
    const config = db.configs.find((c) => c.name === params.name);
    return config ? HttpResponse.json(config) : notFound();
  }),
  http.put(`${API}/configs/:name`, async ({ request, params }) => {
    const i = db.configs.findIndex((c) => c.name === params.name);
    if (i < 0) return notFound();
    const { value } = (await request.json()) as { value: string };
    db.configs[i] = { ...db.configs[i], value };
    return HttpResponse.json(db.configs[i]);
  }),
];

const system: HttpHandler[] = [
  http.get(`${API}/host/getVersion`, () => HttpResponse.json(makeVersion())),
  http.get(`${API}/daemons`, () => HttpResponse.json({ daemons: db.systemStatus.daemons })),
  http.get(`${API}/daemons/:name`, ({ params }) => {
    const daemon = db.systemStatus.daemons.find((d) => d.id === params.name);
    return daemon ? HttpResponse.json(daemon) : notFound();
  }),
  http.post(`${API}/daemons/:name/start`, () => HttpResponse.json({ message: 'started' })),
  http.post(`${API}/daemons/:name/stop`, () => HttpResponse.json({ message: 'stopped' })),
  http.post(`${API}/daemons/:name/restart`, () => HttpResponse.json({ message: 'restarted' })),
  http.get(`${API}/system/status`, () => HttpResponse.json(db.systemStatus)),
  http.get(`${API}/system/state`, () => HttpResponse.json({ state: 'running' })),
  // Applying a saved run-state: `{ state_name }`, not a path segment.
  http.post(`${API}/system/state`, () => HttpResponse.json({ success: true, message: 'applied' })),
  http.post(`${API}/system/startup`, () => {
    db.systemStatus = { ...db.systemStatus, running: true };
    return HttpResponse.json({ message: 'started' });
  }),
  http.post(`${API}/system/shutdown`, () => {
    db.systemStatus = { ...db.systemStatus, running: false };
    return HttpResponse.json({ message: 'stopped' });
  }),
  http.post(`${API}/system/restart`, () => HttpResponse.json({ message: 'restarted' })),
  http.post(`${API}/system/logrot`, () => HttpResponse.json({ message: 'rotated' })),
  http.get(`${API}/server/health_check`, () => HttpResponse.json({ status: 'ok' })),
  // Server locale (zm-api#33). Null zone + blank patterns is a default
  // install: timestamps render with Intl in the viewer's zone, which is what
  // page tests assert. Override per test to exercise the server-zone path.
  http.get(`${API}/system/locale`, () =>
    HttpResponse.json({
      timezone: null,
      utc_offset: '+00:00',
      utc_offset_seconds: 0,
      date_format: '',
      datetime_format: '',
      time_format: '',
    })),
  http.get(`${API}/server-stats`, ({ request }) =>
    HttpResponse.json(pageOf(request, [makeServerStat()])),
  ),
];

const ptz: HttpHandler[] = [
  http.get(`${API}/ptz/protocols`, () =>
    HttpResponse.json({
      protocols: [{ name: 'onvif', is_native: true, description: 'ONVIF PTZ' }],
      native_protocols: ['onvif'],
      perl_fallback_enabled: false,
    }),
  ),
  http.get(`${API}/ptz/monitors/:id/capabilities`, ({ params }) =>
    HttpResponse.json(makePtzCapabilities({ monitor_id: Number(params.id) })),
  ),
  http.get(`${API}/ptz/monitors/:id/status`, ({ params }) =>
    HttpResponse.json(makePtzStatus({ monitor_id: Number(params.id) })),
  ),
  http.post(`${API}/ptz/monitors/:id/*`, () => HttpResponse.json({ success: true })),
  http.delete(`${API}/ptz/monitors/:id/presets/:preset`, () =>
    HttpResponse.json({ message: 'cleared' }),
  ),
];

const filters: HttpHandler[] = [
  http.post(`${API}/filters/preview`, ({ request }) => HttpResponse.json(pageOf(request, db.events))),
  ...crud<Filter>(
    '/filters',
    () => db.filters,
    (body, id) => makeFilter({ ...(body as Partial<Filter>), id }),
    { update: 'PUT' },
  ),
];

/**
 * `GET /logs` and `DELETE /logs` take the same filters (zm-api#21):
 * `min_level` is a *threshold* — that severity or worse, on ZoneMinder's
 * inverted scale, with `fatal` also catching PANIC.
 */
const MIN_LEVEL_CEILING: Record<string, number> = {
  fatal: -3, error: -2, warning: -1, info: 0, debug: 9,
};

/** `time_key` is epoch seconds on a live box, ISO in the fixtures. */
function logSeconds(timeKey: string): number | null {
  if (/^-?\d+(\.\d+)?$/.test(timeKey)) return Number(timeKey);
  const ms = Date.parse(timeKey);
  return Number.isNaN(ms) ? null : ms / 1000;
}

function filteredLogs(url: URL): LogEntry[] {
  const component = url.searchParams.get('component');
  const minLevel = url.searchParams.get('min_level');
  const level = num(url.searchParams.get('level'));
  const search = url.searchParams.get('search');
  const start = num(url.searchParams.get('start'));
  const end = num(url.searchParams.get('end'));
  const serverId = num(url.searchParams.get('server_id'));
  return db.logs.filter((l) => {
    if (component && l.component !== component) return false;
    if (minLevel && l.level > (MIN_LEVEL_CEILING[minLevel] ?? 9)) return false;
    if (level != null && l.level !== level) return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
    if (serverId != null && l.server_id !== serverId) return false;
    const at = logSeconds(l.time_key);
    if (start != null && at != null && at < start) return false;
    if (end != null && at != null && at > end) return false;
    return true;
  });
}

const misc: HttpHandler[] = [
  http.get(`${API}/logs`, ({ request }) => {
    const url = new URL(request.url);
    let rows = filteredLogs(url);
    // `sort` orders on time_key; desc (newest first) is the default.
    if (url.searchParams.get('sort') === 'asc') {
      rows = rows.slice().sort((a, b) => (logSeconds(a.time_key) ?? 0) - (logSeconds(b.time_key) ?? 0));
    }
    return HttpResponse.json(pageOf(request, rows));
  }),
  http.delete(`${API}/logs`, ({ request }) => {
    const doomed = new Set(filteredLogs(new URL(request.url)).map((l) => l.id));
    db.logs = db.logs.filter((l) => !doomed.has(l.id));
    return HttpResponse.json({ message: `Deleted ${doomed.size} log entries` });
  }),
  http.get(`${API}/logs/:id`, ({ params }) => {
    const log = db.logs.find((l) => l.id === Number(params.id));
    return log ? HttpResponse.json(log) : notFound();
  }),
  ...crud<Control>('/controls', () => db.controls, (body, id) =>
    makeControl({ ...(body as Partial<Control>), id })),
  ...crud<ZmStorage>('/storage', () => db.storage, (body, id) =>
    makeStorage({ ...(body as Partial<ZmStorage>), id })),
  ...crud<Server>('/servers', () => db.servers, (body, id) =>
    makeServer({ ...(body as Partial<Server>), id })),
  ...crud<Report>('/reports', () => db.reports, (body, id) =>
    makeReport({ ...(body as Partial<Report>), id })),
  // Users update with PUT, not PATCH (`updateUser` in src/api/users.ts).
  ...crud<User>('/users', () => db.users, (body, id) =>
    makeUser({ ...(body as Partial<User>), id }), { update: 'PUT' }),
  ...crud<MontageLayout>('/montage_layouts', () => db.montageLayouts, (body, id) =>
    makeMontageLayout({ ...(body as Partial<MontageLayout>), id })),
  http.post(`${API}/server/control/:action`, () =>
    HttpResponse.json({ success: true, message: 'ok' }),
  ),
  ...crud<State>('/states', () => db.states, (body, id) =>
    makeState({ ...(body as Partial<State>), id })),
];

/**
 * The default set. Order matters: literal paths come before the `:id`
 * patterns that would otherwise swallow them (`/configs/categories`,
 * `/filters/preview`, `/server/control/{action}`).
 */
export const handlers: HttpHandler[] = [
  ...auth,
  ...monitors,
  ...live,
  ...events,
  ...groups,
  ...configs,
  ...system,
  ...ptz,
  ...filters,
  ...misc,
];
