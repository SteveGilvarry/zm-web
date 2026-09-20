import {
  FILTER_ATTRS,
  type FilterAttr,
  type FilterAstField,
  type FilterOp,
  type FilterSortField,
} from '@/api/filters';

/**
 * How a term's value cell renders and how its value is compared.
 *
 *  string       free text, SQL-ish string compare
 *  number       numeric
 *  bool         0 / 1 (legacy three-state select: All / No / Yes)
 *  datetime     `YYYY-MM-DD HH:MM:SS` or a relative expression (`-1 day`)
 *  date         `YYYY-MM-DD`
 *  time         `HH:MM:SS`
 *  weekday      0 = Monday … 6 = Sunday (MySQL WEEKDAY())
 *  monitor      monitor picker, value = monitor id
 *  monitorName  monitor picker, value = monitor name
 *  storage      storage-area picker, value = storage id
 *  group        monitor-group picker, value = group id
 *  tags         multi-select of tags, value = comma-joined tag ids
 *  zone         zone picker across every monitor, value = zone id
 *  state        run-state picker, value = state id
 *  server       server picker, value = server id / `ZM_SERVER_ID` / `NULL`
 *  exists       on-disk check: `false` / `true`, only with IS / IS NOT
 */
export type FilterAttrKind =
  | 'string' | 'number' | 'bool' | 'datetime' | 'date' | 'time' | 'weekday'
  | 'monitor' | 'monitorName' | 'storage'
  | 'group' | 'tags' | 'zone' | 'state' | 'server' | 'exists';

export interface FilterAttrMeta {
  attr: FilterAttr;
  kind: FilterAttrKind;
  /**
   * The backend AST field this attribute maps to, when `/filters/preview`
   * can evaluate it. Absent = `zmfilter.pl` understands it but only the
   * daemon (or our best-effort client evaluator) can run it.
   */
  astField?: FilterAstField;
}

const META: Record<FilterAttr, Omit<FilterAttrMeta, 'attr'>> = {
  AlarmFrames:        { kind: 'number',      astField: 'alarm_frames' },
  AlarmedZoneId:      { kind: 'zone' },
  Archived:           { kind: 'bool',        astField: 'archived' },
  AvgScore:           { kind: 'number',      astField: 'avg_score' },
  Cause:              { kind: 'string',      astField: 'cause' },
  DiskBlocks:         { kind: 'number' },
  DiskPercent:        { kind: 'number' },
  DiskSpace:          { kind: 'number',      astField: 'disk_space' },
  CurrentDateTime:    { kind: 'datetime' },
  CurrentDate:        { kind: 'date' },
  CurrentTime:        { kind: 'time' },
  CurrentWeekday:     { kind: 'weekday' },
  DateTime:           { kind: 'datetime',    astField: 'start_time' },
  Emailed:            { kind: 'bool',        astField: 'emailed' },
  EndDateTime:        { kind: 'datetime',    astField: 'end_time' },
  EndDate:            { kind: 'date' },
  EndTime:            { kind: 'time' },
  EndWeekday:         { kind: 'weekday' },
  ExistsInFileSystem: { kind: 'exists' },
  FilterServerId:     { kind: 'server' },
  Frames:             { kind: 'number',      astField: 'frames' },
  Group:              { kind: 'group' },
  Id:                 { kind: 'number',      astField: 'id' },
  Length:             { kind: 'number',      astField: 'length' },
  MaxScore:           { kind: 'number',      astField: 'max_score' },
  // Legacy `Monitor` is a monitor *picker* whose value is the id: ZM's
  // `FilterTerm::sql_attr()` maps both `Monitor` and `Group` to `E.MonitorId`,
  // and `filter.js` writes the id into the row. Only `MonitorName` compares
  // the name.
  Monitor:            { kind: 'monitor',     astField: 'monitor_id' },
  MonitorId:          { kind: 'monitor',     astField: 'monitor_id' },
  // The AST has `monitor_name`, but the live backend rejects it in preview
  // ("not supported in preview yet"), so it stays client-evaluated.
  MonitorName:        { kind: 'monitorName' },
  MonitorServerId:    { kind: 'server' },
  Name:               { kind: 'string',      astField: 'name' },
  Notes:              { kind: 'string',      astField: 'notes' },
  SecondaryStorageId: { kind: 'storage' },
  ServerId:           { kind: 'server' },
  StartDateTime:      { kind: 'datetime',    astField: 'start_time' },
  StartDate:          { kind: 'date' },
  StartTime:          { kind: 'time' },
  StartWeekday:       { kind: 'weekday' },
  StateId:            { kind: 'state',       astField: 'state_id' },
  StorageId:          { kind: 'storage',     astField: 'storage_id' },
  StorageServerId:    { kind: 'server' },
  SystemLoad:         { kind: 'number' },
  Tags:               { kind: 'tags' },
  TotScore:           { kind: 'number',      astField: 'tot_score' },
};

export const FILTER_ATTR_META: FilterAttrMeta[] = FILTER_ATTRS.map((attr) => ({ attr, ...META[attr] }));

export function attrMeta(attr: string): FilterAttrMeta | undefined {
  return (FILTER_ATTRS as readonly string[]).includes(attr)
    ? { attr: attr as FilterAttr, ...META[attr as FilterAttr] }
    : undefined;
}

/** Attributes the backend preview can evaluate. */
export const PREVIEWABLE_ATTRS: FilterAttr[] = FILTER_ATTR_META
  .filter((m) => m.astField != null)
  .map((m) => m.attr);

/** Attributes only `zmfilter.pl` (server side) can evaluate. */
export const SERVER_ONLY_ATTRS: FilterAttr[] = FILTER_ATTR_META
  .filter((m) => m.astField == null)
  .map((m) => m.attr);

/**
 * Operator menu per value kind — the full legacy set for strings, pruned
 * where an operator has no meaning for the column type.
 *
 * Some kinds are narrower than the legacy menu on purpose, because
 * `FilterTerm` only ever emits one shape for them: `Group` compiles to
 * ` IN (…)` (equality only), `AlarmedZoneId` to an `EXISTS` sub-select, and
 * `ExistsInFileSystem` is a post-query file check ZM only tests with
 * `IS` / `IS NOT`.
 */
export const OPS_BY_KIND: Record<FilterAttrKind, FilterOp[]> = {
  string:      ['=', '!=', '=~', '!~', '=[]', '![]', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT'],
  number:      ['=', '!=', '>=', '>', '<', '<=', '=[]', '![]', 'IS', 'IS NOT'],
  bool:        ['=', '!=', 'IS', 'IS NOT'],
  datetime:    ['=', '!=', '>=', '>', '<', '<=', 'IS', 'IS NOT'],
  date:        ['=', '!=', '>=', '>', '<', '<=', 'IS', 'IS NOT'],
  time:        ['=', '!=', '>=', '>', '<', '<='],
  weekday:     ['=', '!=', '>=', '>', '<', '<=', '=[]', '![]'],
  monitor:     ['=', '!=', '=[]', '![]'],
  monitorName: ['=', '!=', '=~', '!~', '=[]', '![]', 'LIKE', 'NOT LIKE'],
  storage:     ['=', '!=', '=[]', '![]', 'IS', 'IS NOT'],
  group:       ['='],
  tags:        ['=', '!='],
  zone:        ['='],
  state:       ['=', '!=', '>=', '>', '<', '<=', '=[]', '![]', 'IS', 'IS NOT'],
  server:      ['=', '!='],
  exists:      ['IS', 'IS NOT'],
};

/* ------------------------------------------------------------------------ */
/*  Sentinel values the legacy pickers write                                */
/* ------------------------------------------------------------------------ */

/** `Tags` pseudo-options: no tag at all, or any tag at all. */
export const TAG_NONE = '0';
export const TAG_ANY = '-1';
/** `*ServerId` pseudo-options: whichever server runs the filter, or none. */
export const SERVER_CURRENT = 'ZM_SERVER_ID';
export const SERVER_NONE = 'NULL';

/**
 * Read a `Tags` term value. ZoneMinder stores multi-selects inconsistently
 * (`Filter::decode_multi()` accepts an array, a JSON-array string, a bare
 * number and a comma list), so tolerate all of them; we always write the
 * comma list back.
 */
export function splitTagIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter((v) => v !== '');
  const s = raw == null ? '' : String(raw).trim();
  if (s === '') return [];
  if (s.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter((v) => v !== '');
    } catch { /* fall through to the comma list */ }
  }
  return s.split(',').map((v) => v.trim()).filter((v) => v !== '');
}

/** Legacy sort field → AST field (absent = preview runs unsorted). */
export const SORT_FIELD_TO_AST: Partial<Record<FilterSortField, FilterAstField>> = {
  Id: 'id',
  Name: 'name',
  Cause: 'cause',
  DiskSpace: 'disk_space',
  Notes: 'notes',
  MonitorName: 'monitor_name',
  StartDateTime: 'start_time',
  EndDateTime: 'end_time',
  Length: 'length',
  Frames: 'frames',
  AlarmFrames: 'alarm_frames',
  TotScore: 'tot_score',
  AvgScore: 'avg_score',
  MaxScore: 'max_score',
};

/* ------------------------------------------------------------------------ */
/*  Date/time value helpers                                                 */
/* ------------------------------------------------------------------------ */

const ABSOLUTE_DATETIME =
  /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Normalise a ZoneMinder datetime value to RFC-3339 for the backend.
 * Accepts `YYYY-MM-DD`, `YYYY-MM-DD HH:MM[:SS]`, the datetime-local form
 * with `T`, and an optional zone. A zoneless value is stamped `Z` — zm-api
 * labels server-local `DATETIME`s with `Z` too, so this keeps the compare
 * consistent with what the events endpoint returns. Returns null for
 * anything else (relative expressions such as `-1 day`).
 */
export function toRfc3339(val: string): string | null {
  const m = ABSOLUTE_DATETIME.exec(val.trim());
  if (!m) return null;
  const [, date, hh = '00', mm = '00', ss = '00', zone = 'Z'] = m;
  return `${date}T${hh}:${mm}:${ss}${zone}`;
}

const RELATIVE =
  /^([+-]?\s*\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?(\s+ago)?$/i;

/**
 * Resolve a datetime value to epoch ms. Absolute values go through
 * `toRfc3339`; `now` and `strtotime`-style offsets (`-1 day`, `2 hours ago`,
 * `+30 minutes`) resolve against `now`.
 */
export function resolveDateValue(val: string, now: Date = new Date()): number | null {
  const v = val.trim();
  if (v === '') return null;
  if (/^now$/i.test(v)) return now.getTime();
  const abs = toRfc3339(v);
  if (abs) {
    const t = Date.parse(abs);
    return Number.isNaN(t) ? null : t;
  }
  const m = RELATIVE.exec(v);
  if (!m) return null;
  let n = parseInt(m[1].replace(/\s+/g, ''), 10);
  if (m[3]) n = -n;
  const d = new Date(now.getTime());
  switch (m[2].toLowerCase()) {
    case 'second': case 'sec': d.setUTCSeconds(d.getUTCSeconds() + n); break;
    case 'minute': case 'min': d.setUTCMinutes(d.getUTCMinutes() + n); break;
    case 'hour':   d.setUTCHours(d.getUTCHours() + n); break;
    case 'day':    d.setUTCDate(d.getUTCDate() + n); break;
    case 'week':   d.setUTCDate(d.getUTCDate() + 7 * n); break;
    case 'month':  d.setUTCMonth(d.getUTCMonth() + n); break;
    case 'year':   d.setUTCFullYear(d.getUTCFullYear() + n); break;
  }
  return d.getTime();
}
