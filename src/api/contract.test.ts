/**
 * Contract test: the hand-written API layer against the OpenAPI snapshot.
 *
 * What it catches (all real bugs that shipped before it existed):
 *  - a wrapper calling a method+path the backend does not serve
 *    (storage PUT on a PATCH-only route → 405, swallowed)
 *  - a monitor-editor field bound to a key the backend ignores
 *    (`use_onvif`, `janus_use_rtsp_restream` — value snapped back on save)
 *  - a select option outside the request enum (`ROTATE_0` vs `Rotate0`)
 *  - a create-defaults blob missing a required key or carrying an unknown one
 *
 * Every exported wrapper in `src/api/*.ts` must have an entry in `CALLS`
 * below: a representative invocation whose requests are recorded by an MSW
 * catch-all and matched against `paths`, a `url` builder whose result is
 * matched as a GET, or `pure` for helpers that never touch the network.
 * Adding a wrapper without an entry fails the test on purpose.
 *
 * Refresh the snapshot from `<backend>/api-docs/openapi.json` when the
 * backend changes; see legacy-requirements/review-2026-08-21/.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { TABS } from '@/features/monitors/editor/fields';
import { MONITOR_CREATE_DEFAULTS } from './monitors-crud';
import { MONITOR_ENUMS } from './monitors';

/* ------------------------------------------------------------------------ */
/*  Spec                                                                    */
/* ------------------------------------------------------------------------ */

const SPEC_PATH = resolvePath(__dirname, '../../legacy-requirements/review-2026-08-21/openapi-2026-08-21.json');

type Schema = {
  $ref?: string;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
};
interface Spec {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Schema> };
}

const spec: Spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const schemas = spec.components.schemas;

/** `/api/v3/monitors/{id}/alarm` → regex matching one concrete path. */
const routes = Object.entries(spec.paths).map(([template, ops]) => ({
  template,
  methods: Object.keys(ops).filter((k) => k !== 'parameters').map((m) => m.toUpperCase()),
  re: new RegExp('^' + template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[^/]+') + '$'),
}));

function routeFor(method: string, pathname: string): string | null {
  const hit = routes.find((r) => r.re.test(pathname) && r.methods.includes(method));
  return hit ? `${method} ${hit.template}` : null;
}

/**
 * Follow `$ref` / `allOf` / nullable `oneOf: [{type: null}, {$ref}]` to the
 * schema that carries `enum` or `type`.
 */
function resolve(s: Schema | undefined): Schema | undefined {
  if (!s) return undefined;
  if (s.$ref) return resolve(schemas[s.$ref.split('/').pop()!]);
  const wrapped = (s.allOf ?? s.oneOf ?? s.anyOf)?.filter((m) => m.type !== 'null');
  if (wrapped && wrapped.length === 1) return resolve(wrapped[0]);
  return s;
}

/* ------------------------------------------------------------------------ */
/*  Representative calls                                                    */
/* ------------------------------------------------------------------------ */

type Call =
  | { args: unknown[] }          // async wrapper: requests are recorded and matched
  | { url: unknown[] }           // sync URL builder: result matched as GET
  | 'pure';                      // never touches the network

const CALLS: Record<string, Record<string, Call>> = {
  auth: {
    login: { args: [{ username: 'u', password: 'p' }] },
    logout: { args: ['tok'] },
    refreshToken: { args: ['tok'] },
  },
  configs: {
    getConfigs: { args: [] },
    getConfig: { args: ['ZM_WEB_TITLE'] },
    updateConfig: { args: ['ZM_WEB_TITLE', 'x'] },
  },
  controls: {
    listControls: { args: [] },
    getControl: { args: [1] },
    createControl: { args: [{ name: 'c' }] },
    updateControl: { args: [1, { name: 'c' }] },
    deleteControl: { args: [1] },
    summarizeCapabilities: 'pure',
  },
  events: {
    updateEvent: { args: [1, { notes: 'n' }] },
    getEvents: { args: [] },
    getEvent: { args: [1] },
    deleteEvent: { args: [1] },
    getEventCounts: { args: [24] },
    getEventCountsByMonitor: { args: [24] },
    getEventInfo: { args: [1] },
    getEventVideoUrl: { url: [1] },
    getEventThumbnailUrl: { url: [1] },
    getEventStreamUrl: { url: [1] },
    getEventPlaylistUrl: { url: [1] },
  },
  eventSummaries: {
    listEventSummaries: { args: [] },
    getEventSummary: { args: [1] },
  },
  filters: {
    parseFilterQuery: 'pure',
    serializeFilterQuery: 'pure',
    listFilters: { args: [] },
    getFilter: { args: [1] },
    createFilter: { args: [{ name: 'f', query: '{}' }] },
    updateFilter: { args: [1, { name: 'f' }] },
    deleteFilter: { args: [1] },
    previewFilter: { args: [{ terms: [] }] },
  },
  frames: {
    listFrames: { args: [{ event_id: 1 }] },
    getAllFramesForEvent: { args: [1] },
  },
  groups: {
    listGroups: { args: [] },
    getGroup: { args: [1] },
    createGroup: { args: ['g'] },
    updateGroup: { args: [1, 'g'] },
    deleteGroup: { args: [1] },
    listGroupMonitors: { args: [] },
    attachMonitorToGroup: { args: [1, 2] },
    detachMonitorFromGroup: { args: [1] },
  },
  groupsPermissions: {
    listGroupsPermissions: { args: [] },
    getGroupPermission: { args: [1] },
    createGroupPermission: { args: [{ group_id: 1, user_id: 1, permission: 'View' }] },
    updateGroupPermission: { args: [1, 'View'] },
    deleteGroupPermission: { args: [1] },
  },
  logs: {
    listLogs: { args: [] },
    getLog: { args: [1] },
    levelLabel: 'pure',
    levelColor: 'pure',
  },
  'monitors-crud': {
    toCreatePayload: 'pure',
    resolveStorageId: { args: [0] },
    createMonitor: { args: [{ name: 'm', storage_id: 1 }] },
    cloneMonitor: { args: [1] },
    deleteMonitor: { args: [1] },
    patchMonitor: { args: [1, { name: 'm' }] },
  },
  monitors: {
    canonicalEnum: 'pure',
    normalizeMonitor: 'pure',
    getMonitors: { args: [] },
    getMonitor: { args: [1] },
    updateMonitor: { args: [1, { name: 'm' }] },
    deleteMonitor: { args: [1] },
    controlMonitorAlarm: { args: [1, { action: 'status' }] },
    startLiveStream: { args: [1] },
    stopLiveStream: { args: [1] },
    getLiveStats: { args: [1] },
    getLiveSessions: { args: [] },
    getMonitorSnapshotUrl: { url: [1] },
    getHlsPlaylistUrl: { url: [1] },
    getWebRtcWebsocketUrl: { url: [1] },
  },
  monitorsPermissions: {
    listMonitorsPermissions: { args: [] },
    getMonitorPermission: { args: [1] },
    createMonitorPermission: { args: [{ monitor_id: 1, user_id: 1, permission: 'View' }] },
    updateMonitorPermission: { args: [1, 'View'] },
    deleteMonitorPermission: { args: [1] },
  },
  montageLayouts: {
    listMontageLayouts: { args: [] },
    createMontageLayout: { args: [{ name: 'l', positions: '{}', user_id: 1 }] },
    updateMontageLayout: { args: [1, { name: 'l' }] },
    deleteMontageLayout: { args: [1] },
  },
  ptz: {
    getProtocols: { args: [] },
    getCapabilities: { args: [1] },
    getStatus: { args: [1] },
    move: { args: [1, 'up'] },
    stopMove: { args: [1] },
    zoom: { args: [1, 'in'] },
    stopZoom: { args: [1] },
    focus: { args: [1, 'near'] },
    stopFocus: { args: [1] },
    home: { args: [1] },
    gotoPreset: { args: [1, 2] },
    setPreset: { args: [1, 2, 'p'] },
    clearPreset: { args: [1, 2] },
    moveRelative: { args: [1, {}] },
    moveAbsolute: { args: [1, {}] },
  },
  reports: {
    listReports: { args: [] },
    getReport: { args: [1] },
    createReport: { args: [{ name: 'r' }] },
    updateReport: { args: [1, { name: 'r' }] },
    deleteReport: { args: [1] },
  },
  servers: {
    listServers: { args: [] },
    createServer: { args: [{ name: 's' }] },
    updateServer: { args: [1, { name: 's' }] },
    deleteServer: { args: [1] },
  },
  states: {
    listStates: { args: [] },
    getState: { args: [1] },
    createState: { args: [{ name: 's', definition: '' }] },
    updateState: { args: [1, { name: 's' }] },
    deleteState: { args: [1] },
    applyState: { args: ['default'] },
    changeDaemonState: { args: ['start'] },
    composeDefinition: 'pure',
    parseDefinition: 'pure',
  },
  storage: {
    getStorageList: { args: [] },
    createStorage: { args: [{ name: 's', path: '/x', type: 'local', enabled: 1 }] },
    updateStorage: { args: [1, { enabled: 0 }] },
    deleteStorage: { args: [1] },
  },
  system: {
    getVersion: { args: [] },
    getDaemons: { args: [] },
    getDaemon: { args: ['zmc'] },
    startDaemon: { args: ['zmc'] },
    stopDaemon: { args: ['zmc'] },
    restartDaemon: { args: ['zmc'] },
    getSystemStatus: { args: [] },
    systemStartup: { args: [] },
    systemShutdown: { args: [] },
    systemRestart: { args: [] },
    getServerStats: { args: [] },
    getHealthCheck: { args: [] },
    systemLogRotate: { args: [] },
  },
  tags: {
    listTags: { args: [] },
    createTag: { args: ['t'] },
    deleteTag: { args: [1] },
    getTagDetail: { args: [1] },
    attachTag: { args: [1, 2] },
    detachTag: { args: [1, 2] },
  },
  users: {
    getUsers: { args: [] },
    getUser: { args: [1] },
    createUser: { args: [{ username: 'u', password: 'p' }] },
    updateUser: { args: [1, { username: 'u' }] },
    deleteUser: { args: [1] },
  },
  zones: {
    listZonesForMonitor: { args: [1] },
    createZone: { args: [1, { name: 'z' }] },
    updateZone: { args: [1, { name: 'z' }] },
    deleteZone: { args: [1] },
    listZonePresets: { args: [] },
    parseCoords: 'pure',
    serializeCoords: 'pure',
    insertMidpoint: 'pure',
  },
};

/**
 * Drift in modules this test's owner could not fix. Each entry must still
 * be drifted — a stale entry fails the test so the list only shrinks.
 */
const KNOWN_DRIFT: Record<string, string> = {
};

/* ------------------------------------------------------------------------ */
/*  Wrapper modules                                                         */
/* ------------------------------------------------------------------------ */

type Fn = (...a: unknown[]) => unknown;
const modules = import.meta.glob<Record<string, unknown>>(
  ['./*.ts', '!./*.test.ts', '!./client.ts', '!./base.ts', '!./index.ts'],
  { eager: true },
);
const moduleName = (file: string) => file.replace(/^\.\//, '').replace(/\.ts$/, '');

/** Every callable export, with `ptz.move` style names for namespace objects. */
function callables(mod: Record<string, unknown>): Record<string, Fn> {
  const out: Record<string, Fn> = {};
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === 'function') out[name] = value as Fn;
    else if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).length > 0 && Object.values(value).every((v) => typeof v === 'function')) {
      for (const [k, v] of Object.entries(value)) out[k] = v as Fn;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/*  Recorder                                                                */
/* ------------------------------------------------------------------------ */

let recorded: Array<{ method: string; pathname: string }> = [];
const GENERIC_BODY = {
  id: 1, items: [{ id: 1 }], total: 1, per_page: 1, current_page: 1, last_page: 1,
  counts: {}, access_token: 't', refresh_token: 't', expire_in: 60, token_type: 'Bearer',
};
const server = setupServer(
  http.all('*', ({ request }) => {
    recorded.push({ method: request.method, pathname: new URL(request.url).pathname });
    return HttpResponse.json(GENERIC_BODY);
  }),
);

beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/* ------------------------------------------------------------------------ */
/*  (a) every wrapper hits a method+path the spec serves                    */
/* ------------------------------------------------------------------------ */

describe('API wrappers match the OpenAPI paths', () => {
  it('every exported wrapper has a representative call in CALLS', () => {
    const missing: string[] = [];
    const stale: string[] = [];
    for (const [file, mod] of Object.entries(modules)) {
      const name = moduleName(file);
      const fns = callables(mod);
      for (const fn of Object.keys(fns)) if (!CALLS[name]?.[fn]) missing.push(`${name}.${fn}`);
      for (const fn of Object.keys(CALLS[name] ?? {})) if (!fns[fn]) stale.push(`${name}.${fn}`);
    }
    expect(missing, 'wrappers with no CALLS entry').toEqual([]);
    expect(stale, 'CALLS entries with no wrapper').toEqual([]);
  });

  const drifted = new Set<string>();

  for (const [file, mod] of Object.entries(modules)) {
    const name = moduleName(file);
    const fns = callables(mod);
    for (const [fn, call] of Object.entries(CALLS[name] ?? {})) {
      if (call === 'pure' || !fns[fn]) continue;
      const id = `${name}.${fn}`;

      it(id, async () => {
        let hits: Array<{ method: string; pathname: string }>;
        if ('url' in call) {
          const out = fns[fn](...call.url);
          expect(typeof out).toBe('string');
          hits = [{ method: 'GET', pathname: new URL(out as string, 'http://localhost').pathname }];
        } else {
          recorded = [];
          try { await fns[fn](...call.args); } catch { /* response shape is irrelevant here */ }
          hits = recorded;
          expect(hits.length, `${id} issued no request`).toBeGreaterThan(0);
        }
        const unmatched = hits.filter((h) => !routeFor(h.method, h.pathname)).map((h) => `${h.method} ${h.pathname}`);
        if (KNOWN_DRIFT[id]) {
          if (unmatched.length > 0) drifted.add(id);
          return;
        }
        expect(unmatched, `${id} → not in spec`).toEqual([]);
      });
    }
  }

  it('KNOWN_DRIFT entries are still drifted (remove fixed ones)', () => {
    expect([...drifted].sort()).toEqual(Object.keys(KNOWN_DRIFT).sort());
  });
});

/* ------------------------------------------------------------------------ */
/*  (b)+(c) monitor editor fields vs UpdateMonitorRequest                   */
/* ------------------------------------------------------------------------ */

describe('monitor editor fields match UpdateMonitorRequest', () => {
  const update = schemas.UpdateMonitorRequest.properties!;
  const fields = TABS.flatMap((t) => t.fields).filter((f) => f.kind !== 'group');

  it('every field key is a request property', () => {
    const unknown = fields.map((f) => f.key).filter((k) => !(k in update));
    expect(unknown).toEqual([]);
  });

  for (const f of fields.filter((f) => f.kind === 'select' && f.options)) {
    it(`${f.key} options are members of the request schema`, () => {
      const schema = resolve(update[f.key]);
      expect(schema, `${f.key} has no resolvable schema`).toBeDefined();
      const values = f.options!.map((o) => o.value);
      if (schema!.enum) {
        const bad = values.filter((v) => !schema!.enum!.includes(v));
        expect(bad, `${f.key} options outside enum ${JSON.stringify(schema!.enum)}`).toEqual([]);
      } else {
        const types = ([] as string[]).concat(schema!.type ?? []);
        const ok = types.includes('integer') || types.includes('number')
          ? values.every((v) => typeof v === 'number')
          : values.every((v) => typeof v === 'string');
        expect(ok, `${f.key} option types do not match ${JSON.stringify(types)}`).toBe(true);
      }
    });
  }
});

/* ------------------------------------------------------------------------ */
/*  (d)+(e) create defaults and enum vocabularies vs CreateMonitorRequest   */
/* ------------------------------------------------------------------------ */

describe('MONITOR_CREATE_DEFAULTS match CreateMonitorRequest', () => {
  const create = schemas.CreateMonitorRequest;
  const props = create.properties!;
  const keys = Object.keys(MONITOR_CREATE_DEFAULTS);

  it('carries only request properties', () => {
    expect(keys.filter((k) => !(k in props))).toEqual([]);
  });

  it('carries every required property', () => {
    expect((create.required ?? []).filter((k) => !keys.includes(k))).toEqual([]);
  });

  it('enum-valued defaults are enum members', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(MONITOR_CREATE_DEFAULTS)) {
      const e = resolve(props[k])?.enum;
      if (e && v != null && !e.includes(v)) bad.push(`${k}=${String(v)}`);
    }
    expect(bad).toEqual([]);
  });

  it('deleted is the boolean the request schema wants', () => {
    expect(resolve(props.deleted)?.type).toBe('boolean');
    expect(typeof MONITOR_CREATE_DEFAULTS.deleted).toBe('boolean');
  });
});

describe('MONITOR_ENUMS mirror the request enums', () => {
  const props = schemas.UpdateMonitorRequest.properties!;
  for (const [field, members] of Object.entries(MONITOR_ENUMS)) {
    it(field, () => {
      expect([...members].sort()).toEqual([...(resolve(props[field])!.enum as string[])].sort());
    });
  }
});
