import type { User, ZmConfig, ZmStorage } from '@/types';
import type { Group, GroupMonitor } from '@/api/groups';
import type { Filter } from '@/api/filters';
import { FILTER_FLAG_DEFAULTS } from '@/api/filters';
import type { LogEntry } from '@/api/logs';
import type { Server } from '@/api/servers';
import type { State } from '@/api/states';
import type { Report } from '@/api/reports';
import type { MontageLayout } from '@/api/montageLayouts';
import { serialisePositions } from '@/features/montage/layoutFormat';

/** A user row (`GET /api/v3/users`). Permission columns are `None|View|Edit`. */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: 'admin',
    name: 'admin',
    email: 'admin@example.test',
    enabled: 1,
    system: 'Edit',
    stream: 'View',
    events: 'Edit',
    control: 'Edit',
    monitors: 'Edit',
    groups: 'Edit',
    devices: 'Edit',
    snapshots: 'Edit',
    // No `phone` — `UserResponse` does not declare one, even though the
    // underlying Users table has the column. Pass it explicitly if a test
    // needs it.
    // Required in UserResponse.
    api_enabled: 1,
    home_view: 'console',
    phone: '',
    ...overrides,
  };
}

/** A monitor group (`GET /api/v3/groups`). `parent_id` nests the tree. */
export function makeGroup(overrides: Partial<Group> = {}): Group {
  return { id: 1, name: 'Outdoor', parent_id: null, ...overrides };
}

/** A group↔monitor join row (`GET /api/v3/groups-monitors`). */
export function makeGroupMonitor(overrides: Partial<GroupMonitor> = {}): GroupMonitor {
  return { id: 1, group_id: 1, monitor_id: 1, ...overrides };
}

/**
 * A saved filter (`GET /api/v3/filters`). Every action column exists as its
 * own 0/1 int — only the rule set, sort and limit live in `query_json`.
 */
export function makeFilter(overrides: Partial<Filter> = {}): Filter {
  return {
    ...FILTER_FLAG_DEFAULTS,
    id: 1,
    name: 'Recent motion',
    query_json: JSON.stringify({
      terms: [{ attr: 'MonitorId', op: '=', val: '1' }],
      sort_field: 'StartDateTime',
      sort_asc: '0',
      limit: '100',
    }),
    filter: null,
    ...overrides,
  };
}

/** A log line (`GET /api/v3/logs`). `level` is ZM's numeric code, not a name. */
export function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    time_key: '2026-08-21T09:00:00Z',
    level: 0,
    code: 'INF',
    component: 'zmc_m1',
    message: 'Starting capture',
    pid: 4242,
    server_id: null,
    file: 'zm_monitor.cpp',
    line: 1200,
    ...overrides,
  };
}

/** A config row (`GET /api/v3/configs`). `value` is always a string. */
export function makeConfig(overrides: Partial<ZmConfig> = {}): ZmConfig {
  return {
    id: 1,
    name: 'ZM_WEB_TITLE',
    value: 'ZoneMinder',
    type: 'string',
    category: 'web',
    readonly: 0,
    private: 0,
    system: 0,
    default_value: 'ZoneMinder',
    help: 'Title used in the web interface.',
    hint: 'string',
    prompt: 'Web site title',
    pattern: null,
    format: null,
    ...overrides,
  };
}

/** A storage area (`GET /api/v3/storage`). */
export function makeStorage(overrides: Partial<ZmStorage> = {}): ZmStorage {
  return {
    id: 1,
    name: 'Default',
    path: '/var/cache/zoneminder/events',
    type: 'local',
    enabled: 1,
    // Full row since zm-api#24.
    scheme: 'Medium',
    server_id: 0,
    url: null,
    disk_space: 46_548_754_474,
    do_delete: 1,
    ...overrides,
  };
}

/** A cluster server (`GET /api/v3/servers`). */
export function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    id: 1,
    name: 'zm-node-1',
    hostname: 'zm-node-1.local',
    port: 80,
    status: 'Running',
    // Full row since zm-api#25.
    protocol: 'http',
    path_to_index: '/zm/index.php',
    path_to_zms: '/zm/cgi-bin/nph-zms',
    path_to_api: '/zm/api',
    zmaudit: 1,
    zmstats: 1,
    zmtrigger: 0,
    zmeventnotification: 0,
    state_id: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

/** A run-state (`GET /api/v3/states`). `definition` is `id:cap:ana:rec,…`. */
export function makeState(overrides: Partial<State> = {}): State {
  return {
    id: 1,
    name: 'default',
    definition: '1:Always:Always:OnMotion',
    is_active: 1,
    ...overrides,
  };
}

/** A saved report (`GET /api/v3/reports`). */
export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 1,
    name: 'Nightly',
    start_date_time: '2026-08-20T22:00:00Z',
    end_date_time: '2026-08-21T06:00:00Z',
    filter_id: 1,
    interval: 1440,
    ...overrides,
  };
}

/**
 * A saved montage layout (`GET /api/v3/montage_layouts`).
 *
 * `positions` is an opaque string column, but not a free-for-all: the page
 * only shows a layout `parsePositions()` can read — ZoneMinder's `gridStack`
 * rows plus our `dashboard.version: 1` tree. Rather than hand-write that,
 * the default runs the app's own `serialisePositions()` over a two-up row,
 * so a seeded layout actually turns up in the Saved-layouts menu.
 */
export function makeMontageLayout(overrides: Partial<MontageLayout> = {}): MontageLayout {
  return {
    id: 1,
    name: 'Wall',
    positions: serialisePositions(
      {
        type: 'split',
        direction: 'row',
        sizes: [0.5, 0.5],
        children: [
          { type: 'leaf', monitorId: 1 },
          { type: 'leaf', monitorId: 2 },
        ],
      },
      'outside',
    ),
    user_id: 1,
    ...overrides,
  };
}
