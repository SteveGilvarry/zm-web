import type { FilterQuery, FilterSortField, FilterTerm } from '@/api/filters';
import type { Monitor, ZmEvent } from '@/types';
import { attrMeta, resolveDateValue, type FilterAttrKind } from './attrs';
import { buildTermTree, type TermTree } from './tree';

/**
 * Best-effort client-side evaluation of a ZoneMinder term list against a
 * slice of events. `zmfilter.pl` is the source of truth; `POST
 * /filters/preview` is the faithful preview for everything the backend AST
 * models. This evaluator exists for the rest — regex operators, relative
 * dates, date/time/weekday decompositions, Monitor/MonitorName, Tags — and
 * for the Reports chart.
 *
 * Time: zm_api stamps server-local DATETIMEs with `Z`, so every comparison
 * here is done in UTC on those stamps; absolute user values are parsed the
 * same way (see `toRfc3339`). That keeps `StartDate`, `StartTime` and
 * `StartWeekday` consistent with what the daemon computes in server time.
 *
 * Attributes the client cannot know (disk usage, server ids, group
 * membership, file-system checks, alarmed zone) are treated as matching and
 * reported by `unevaluableAttrs()` so the UI can say so.
 */
export interface EvaluateContext {
  monitors?: Monitor[];
  now?: Date;
}

const CLIENT_UNEVALUABLE = new Set([
  'AlarmedZoneId', 'DiskBlocks', 'DiskPercent', 'ExistsInFileSystem', 'FilterServerId',
  'Group', 'MonitorServerId', 'ServerId', 'StorageServerId', 'SystemLoad',
]);

export function unevaluableAttrs(query: FilterQuery): string[] {
  const out = new Set<string>();
  for (const t of query.terms) {
    if (CLIENT_UNEVALUABLE.has(t.attr) || !attrMeta(t.attr)) out.add(t.attr);
  }
  return [...out];
}

export function evaluateFilter(
  query: FilterQuery,
  events: ZmEvent[],
  ctx: EvaluateContext = {},
): ZmEvent[] {
  const { tree } = buildTermTree(query.terms);
  const monitorNames = new Map<number, string>();
  for (const m of ctx.monitors ?? []) monitorNames.set(m.id, m.name);
  const env: Env = { now: ctx.now ?? new Date(), monitorNames };

  const matched = tree == null ? events.slice() : events.filter((e) => walk(tree, e, env));

  const sortField = (query.sort_field ?? '') as FilterSortField;
  if (sortField !== '') {
    const dir = query.sort_asc === '1' ? 1 : -1;
    const key = sortAccessor(sortField, env);
    matched.sort((a, b) => dir * compareSortKeys(key(a), key(b)));
  }
  const limit = Number(query.limit ?? 0);
  if (Number.isFinite(limit) && limit > 0) return matched.slice(0, Math.floor(limit));
  return matched;
}

/* ------------------------------------------------------------------------ */

interface Env {
  now: Date;
  monitorNames: Map<number, string>;
}

function walk(node: TermTree, e: ZmEvent, env: Env): boolean {
  if (node.kind === 'leaf') return matchTerm(node.term, e, env) ?? true;
  if (node.match === 'all') return node.rules.every((r) => walk(r, e, env));
  return node.rules.some((r) => walk(r, e, env));
}

/** Event-side value for an attribute, already in the kind's comparison domain. */
function fieldValue(attr: string, kind: FilterAttrKind, e: ZmEvent, env: Env): unknown {
  const start = e.start_date_time ? Date.parse(e.start_date_time) : null;
  const end = e.end_date_time ? Date.parse(e.end_date_time) : null;
  const nowMs = env.now.getTime();
  switch (attr) {
    case 'Id': return e.id;
    case 'MonitorId': return e.monitor_id;
    case 'Monitor':
    case 'MonitorName': return env.monitorNames.get(e.monitor_id) ?? null;
    case 'Name': return e.name;
    case 'Cause': return e.cause ?? null;
    case 'Notes': return e.notes ?? null;
    case 'StartDateTime':
    case 'DateTime': return start;
    case 'EndDateTime': return end;
    case 'StartDate': return start == null ? null : datePart(start);
    case 'EndDate': return end == null ? null : datePart(end);
    case 'StartTime': return start == null ? null : timePart(start);
    case 'EndTime': return end == null ? null : timePart(end);
    case 'StartWeekday': return start == null ? null : weekday(start);
    case 'EndWeekday': return end == null ? null : weekday(end);
    case 'CurrentDateTime': return nowMs;
    case 'CurrentDate': return datePart(nowMs);
    case 'CurrentTime': return timePart(nowMs);
    case 'CurrentWeekday': return weekday(nowMs);
    case 'Length': return e.length == null ? null : Number(e.length);
    case 'Frames': return e.frames;
    case 'AlarmFrames': return e.alarm_frames;
    case 'TotScore': return e.tot_score;
    case 'AvgScore': return e.avg_score ?? null;
    case 'MaxScore': return e.max_score ?? null;
    case 'Archived': return e.archived;
    case 'Emailed': return e.emailed;
    case 'StateId': return e.state_id;
    case 'StorageId': return e.storage_id;
    case 'SecondaryStorageId': return e.secondary_storage_id ?? null;
    case 'DiskSpace': return e.disk_space ?? null;
    case 'Tags': return (e.tags ?? []).map((t) => `${t.id}|${t.name}`);
    default:
      void kind;
      return undefined;
  }
}

/** null = cannot evaluate (treated as a match). */
function matchTerm(term: FilterTerm, e: ZmEvent, env: Env): boolean | null {
  const meta = attrMeta(term.attr);
  if (!meta || CLIENT_UNEVALUABLE.has(term.attr)) return null;
  const lhs = fieldValue(term.attr, meta.kind, e, env);
  if (lhs === undefined) return null;
  const val = term.val == null ? '' : String(term.val);

  // Tags: membership on id or name; `=[]` / `![]` take a list.
  if (term.attr === 'Tags') {
    const tags = lhs as string[];
    const has = (v: string) => tags.some((t) => {
      const [id, name] = t.split('|');
      return id === v.trim() || name.toLowerCase() === v.trim().toLowerCase();
    });
    switch (term.op) {
      case '=':
      case 'LIKE': return has(val);
      case '!=':
      case 'NOT LIKE': return !has(val);
      case '=[]': return splitSet(val).some(has);
      case '![]': return !splitSet(val).some(has);
      case 'IS': return tags.length === 0;
      case 'IS NOT': return tags.length > 0;
      default: return null;
    }
  }

  switch (term.op) {
    case 'IS': return isMatch(lhs, val);
    case 'IS NOT': return !isMatch(lhs, val);
    case '=~': return safeRegex(val).test(str(lhs));
    case '!~': return !safeRegex(val).test(str(lhs));
    case 'LIKE': return likeMatch(str(lhs), `%${val}%`);
    case 'NOT LIKE': return !likeMatch(str(lhs), `%${val}%`);
    case '=[]': return splitSet(val).some((v) => compare(meta.kind, lhs, v, env) === 0);
    case '![]': return !splitSet(val).some((v) => compare(meta.kind, lhs, v, env) === 0);
    default: {
      const c = compare(meta.kind, lhs, val, env);
      if (c == null) return false;
      switch (term.op) {
        case '=': return c === 0;
        case '!=': return c !== 0;
        case '>': return c > 0;
        case '>=': return c >= 0;
        case '<': return c < 0;
        case '<=': return c <= 0;
      }
    }
  }
}

/**
 * Three-way compare of an event value against the term's string value in
 * the attribute's domain. null = not comparable (NULL on either side, bad
 * number, unparsable date).
 */
function compare(kind: FilterAttrKind, lhs: unknown, raw: string, env: Env): number | null {
  if (lhs == null) return null;
  switch (kind) {
    case 'number':
    case 'monitor':
    case 'storage':
    case 'bool':
    case 'weekday': {
      const l = Number(lhs);
      const r = Number(raw.trim());
      if (!Number.isFinite(l) || !Number.isFinite(r) || raw.trim() === '') return null;
      return Math.sign(l - r);
    }
    case 'datetime': {
      const r = resolveDateValue(raw, env.now);
      if (r == null || typeof lhs !== 'number' || Number.isNaN(lhs)) return null;
      return Math.sign(lhs - r);
    }
    case 'date': {
      const r = resolveDateValue(raw, env.now);
      const rs = r == null ? raw.trim() : datePart(r);
      return cmpStr(String(lhs), rs);
    }
    case 'time': {
      const rs = normaliseTime(raw);
      if (!rs) return null;
      return cmpStr(String(lhs), rs);
    }
    case 'string':
    case 'monitorName':
      return cmpStr(String(lhs).toLowerCase(), raw.toLowerCase());
  }
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSortKeys(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b);
  return cmpStr(String(a), String(b));
}

function sortAccessor(field: FilterSortField, env: Env): (e: ZmEvent) => unknown {
  switch (field) {
    case 'Id': return (e) => e.id;
    case 'Name': return (e) => e.name;
    case 'Cause': return (e) => e.cause ?? null;
    case 'Tags': return (e) => (e.tags ?? []).map((t) => t.name).join(',');
    case 'DiskSpace': return (e) => e.disk_space ?? null;
    case 'Notes': return (e) => e.notes ?? null;
    case 'MonitorName': return (e) => env.monitorNames.get(e.monitor_id) ?? null;
    case 'StartDateTime': return (e) => (e.start_date_time ? Date.parse(e.start_date_time) : null);
    case 'EndDateTime': return (e) => (e.end_date_time ? Date.parse(e.end_date_time) : null);
    case 'Length': return (e) => (e.length == null ? null : Number(e.length));
    case 'Frames': return (e) => e.frames;
    case 'AlarmFrames': return (e) => e.alarm_frames;
    case 'TotScore': return (e) => e.tot_score;
    case 'AvgScore': return (e) => e.avg_score ?? null;
    case 'MaxScore': return (e) => e.max_score ?? null;
    default: return () => null;
  }
}

/** `IS` / `IS NOT` — legacy value set is NULL / 0 / 1. */
function isMatch(lhs: unknown, raw: string): boolean {
  const v = raw.trim().toUpperCase();
  if (v === 'NULL' || v === '') return lhs == null || lhs === '';
  return Number(lhs) === Number(v);
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function splitSet(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function safeRegex(src: string): RegExp {
  try {
    return new RegExp(src, 'i');
  } catch {
    return /(?!)/; // malformed pattern matches nothing, like a SQL error would
  }
}

/** SQL LIKE: `%` → `.*`, `_` → `.`; case-insensitive, anchored. */
function likeMatch(haystack: string, pattern: string): boolean {
  const esc = pattern
    .replace(/[.+^${}()|[\]\\*?]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  try {
    return new RegExp(`^${esc}$`, 'i').test(haystack);
  } catch {
    return false;
  }
}

function datePart(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function timePart(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

/** MySQL WEEKDAY(): 0 = Monday … 6 = Sunday. */
function weekday(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

function normaliseTime(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
}
