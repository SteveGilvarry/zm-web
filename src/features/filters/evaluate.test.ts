import { describe, expect, it } from 'vitest';
import { evaluateFilter, unevaluableAttrs } from './evaluate';
import { parseFilterQuery, type FilterQuery, type FilterTerm } from '@/api/filters';
import type { Monitor, ZmEvent } from '@/types';
import { PURGE_WHEN_FULL_QUERY_JSON } from './liveFixtures';

const e = (overrides: Partial<ZmEvent>): ZmEvent =>
  ({
    id: 1,
    monitor_id: 1,
    storage_id: 1,
    name: 'Event',
    cause: 'Motion',
    notes: '',
    archived: 0,
    frames: 100,
    alarm_frames: 0,
    tot_score: 0,
    avg_score: 0,
    max_score: 0,
    start_date_time: '2026-05-24T12:00:00Z',
    end_date_time: '2026-05-24T12:01:00Z',
    length: '60',
    width: 1920,
    height: 1080,
    orientation: 'Rotate0',
    state_id: 1,
    ...overrides,
  } as unknown as ZmEvent);

const q = (terms: FilterTerm[], rest: Partial<FilterQuery> = {}): FilterQuery => ({ terms, ...rest });
const ids = (out: ZmEvent[]) => out.map((x) => x.id);

const monitors = [{ id: 1, name: 'Front Door' }, { id: 2, name: 'Driveway' }] as unknown as Monitor[];

describe('evaluateFilter — empty query', () => {
  it('returns all events when there are no terms', () => {
    expect(evaluateFilter(q([]), [e({ id: 1 }), e({ id: 2 })])).toHaveLength(2);
  });
});

describe('evaluateFilter — operators', () => {
  const events = [
    e({ id: 1, monitor_id: 1, max_score: 50, cause: 'Motion' }),
    e({ id: 2, monitor_id: 2, max_score: 80, cause: 'Continuous' }),
    e({ id: 3, monitor_id: 2, max_score: 10, cause: 'Motion: Front', notes: null }),
  ];

  it('= and != on numbers and strings (case-insensitive, like SQL)', () => {
    expect(ids(evaluateFilter(q([{ attr: 'MonitorId', op: '=', val: '2' }]), events))).toEqual([2, 3]);
    expect(ids(evaluateFilter(q([{ attr: 'Cause', op: '=', val: 'motion' }]), events))).toEqual([1]);
    expect(ids(evaluateFilter(q([{ attr: 'Cause', op: '!=', val: 'Motion' }]), events))).toEqual([2, 3]);
  });

  it('>, >=, <, <=', () => {
    expect(ids(evaluateFilter(q([{ attr: 'MaxScore', op: '>', val: '50' }]), events))).toEqual([2]);
    expect(ids(evaluateFilter(q([{ attr: 'MaxScore', op: '>=', val: '50' }]), events))).toEqual([1, 2]);
    expect(ids(evaluateFilter(q([{ attr: 'MaxScore', op: '<', val: '50' }]), events))).toEqual([3]);
    expect(ids(evaluateFilter(q([{ attr: 'MaxScore', op: '<=', val: '50' }]), events))).toEqual([1, 3]);
  });

  it('LIKE is "contains" (ZM wraps %val%), NOT LIKE inverts', () => {
    expect(ids(evaluateFilter(q([{ attr: 'Cause', op: 'LIKE', val: 'motion' }]), events))).toEqual([1, 3]);
    expect(ids(evaluateFilter(q([{ attr: 'Cause', op: 'NOT LIKE', val: 'motion' }]), events))).toEqual([2]);
  });

  it('=~ / !~ regex', () => {
    expect(ids(evaluateFilter(q([{ attr: 'Cause', op: '=~', val: '^Motion: ' }]), events))).toEqual([3]);
    expect(ids(evaluateFilter(q([{ attr: 'Cause', op: '!~', val: '^Motion' }]), events))).toEqual([2]);
    // A malformed pattern matches nothing rather than throwing.
    expect(evaluateFilter(q([{ attr: 'Cause', op: '=~', val: '(' }]), events)).toEqual([]);
  });

  it('=[] / ![] sets', () => {
    expect(ids(evaluateFilter(q([{ attr: 'MonitorId', op: '=[]', val: '1, 3' }]), events))).toEqual([1]);
    expect(ids(evaluateFilter(q([{ attr: 'MonitorId', op: '![]', val: '1' }]), events))).toEqual([2, 3]);
  });

  it('IS / IS NOT NULL', () => {
    expect(ids(evaluateFilter(q([{ attr: 'Notes', op: 'IS', val: 'NULL' }]), events))).toEqual([1, 2, 3]);
    const withNotes = [...events, e({ id: 4, notes: 'hi' })];
    expect(ids(evaluateFilter(q([{ attr: 'Notes', op: 'IS NOT', val: 'NULL' }]), withNotes))).toEqual([4]);
  });
});

describe('evaluateFilter — dates and times', () => {
  const events = [
    e({ id: 1, start_date_time: '2026-05-24T12:00:00Z', end_date_time: '2026-05-24T12:05:00Z' }), // Sunday
    e({ id: 2, start_date_time: '2026-05-25T08:30:00Z', end_date_time: '2026-05-25T08:40:00Z' }), // Monday
    e({ id: 3, start_date_time: '2026-06-01T23:59:59Z', end_date_time: null }),
  ];

  it('compares StartDateTime / EndDateTime as instants, not as numbers', () => {
    // Before the fix these were Number('2026-…') = NaN and never matched.
    expect(ids(evaluateFilter(q([{ attr: 'StartDateTime', op: '>=', val: '2026-05-25 00:00:00' }]), events))).toEqual([2, 3]);
    expect(ids(evaluateFilter(q([{ attr: 'StartDateTime', op: '<', val: '2026-05-25' }]), events))).toEqual([1]);
    expect(ids(evaluateFilter(q([{ attr: 'EndDateTime', op: 'IS', val: 'NULL' }]), events))).toEqual([3]);
    expect(ids(evaluateFilter(q([{ attr: 'EndDateTime', op: '>', val: '2026-05-24T12:04' }]), events))).toEqual([1, 2]);
  });

  it('resolves relative expressions against now', () => {
    const now = new Date('2026-05-26T00:00:00Z');
    expect(ids(evaluateFilter(q([{ attr: 'StartDateTime', op: '>=', val: '-1 day' }]), events, { now }))).toEqual([2, 3]);
    expect(ids(evaluateFilter(q([{ attr: 'StartDateTime', op: '<', val: '2 days ago' }]), events, { now }))).toEqual([]);
    expect(ids(evaluateFilter(q([{ attr: 'StartDateTime', op: '>', val: 'now' }]), events, { now }))).toEqual([3]);
  });

  it('StartDate / StartTime / StartWeekday decompositions', () => {
    expect(ids(evaluateFilter(q([{ attr: 'StartDate', op: '=', val: '2026-05-25' }]), events))).toEqual([2]);
    expect(ids(evaluateFilter(q([{ attr: 'StartTime', op: '>=', val: '12:00' }]), events))).toEqual([1, 3]);
    expect(ids(evaluateFilter(q([{ attr: 'EndTime', op: '<', val: '09:00:00' }]), events))).toEqual([2]);
    // MySQL WEEKDAY(): 0 = Monday, 6 = Sunday
    expect(ids(evaluateFilter(q([{ attr: 'StartWeekday', op: '=', val: '6' }]), events))).toEqual([1]);
    expect(ids(evaluateFilter(q([{ attr: 'StartWeekday', op: '=[]', val: '0,1,2,3,4' }]), events))).toEqual([2, 3]);
  });

  it('Current* attributes use now', () => {
    const now = new Date('2026-05-25T10:00:00Z'); // Monday
    expect(evaluateFilter(q([{ attr: 'CurrentWeekday', op: '=', val: '0' }]), events, { now })).toHaveLength(3);
    expect(evaluateFilter(q([{ attr: 'CurrentTime', op: '<', val: '09:00' }]), events, { now })).toHaveLength(0);
  });
});

describe('evaluateFilter — monitors, tags, unevaluable attributes', () => {
  const events = [
    e({ id: 1, monitor_id: 1, tags: [{ id: 5, name: 'person' }] }),
    e({ id: 2, monitor_id: 2, tags: [] }),
  ];

  it('Monitor / MonitorName compare the monitor name via the monitors list', () => {
    expect(ids(evaluateFilter(q([{ attr: 'MonitorName', op: '=', val: 'Driveway' }]), events, { monitors }))).toEqual([2]);
    expect(ids(evaluateFilter(q([{ attr: 'Monitor', op: 'LIKE', val: 'front' }]), events, { monitors }))).toEqual([1]);
  });

  it('Tags match by id or name', () => {
    expect(ids(evaluateFilter(q([{ attr: 'Tags', op: '=', val: 'person' }]), events))).toEqual([1]);
    expect(ids(evaluateFilter(q([{ attr: 'Tags', op: '=[]', val: '5,9' }]), events))).toEqual([1]);
    expect(ids(evaluateFilter(q([{ attr: 'Tags', op: 'IS', val: 'NULL' }]), events))).toEqual([2]);
  });

  it('treats attributes it cannot know as matching and reports them', () => {
    const parsed = parseFilterQuery(PURGE_WHEN_FULL_QUERY_JSON);
    if (!parsed.ok) throw new Error(parsed.reason);
    // Archived=0 AND DiskPercent>=80 (unknown → true) AND EndDateTime IS NOT NULL
    const evs = [e({ id: 1, archived: 0 }), e({ id: 2, archived: 1 }), e({ id: 3, archived: 0, end_date_time: null })];
    expect(ids(evaluateFilter(parsed.query, evs))).toEqual([1]);
    expect(unevaluableAttrs(parsed.query)).toEqual(['DiskPercent']);
  });
});

describe('evaluateFilter — conjunctions, brackets, sort, limit', () => {
  const events = [
    e({ id: 1, monitor_id: 1, max_score: 90, start_date_time: '2026-05-24T10:00:00Z' }),
    e({ id: 2, monitor_id: 2, max_score: 20, start_date_time: '2026-05-24T11:00:00Z' }),
    e({ id: 3, monitor_id: 2, max_score: 70, start_date_time: '2026-05-24T09:00:00Z' }),
  ];

  it('AND binds tighter than OR; brackets override', () => {
    // m=1 OR (m=2 AND score>50) → 1, 3
    expect(ids(evaluateFilter(q([
      { attr: 'MonitorId', op: '=', val: '1' },
      { cnj: 'or', attr: 'MonitorId', op: '=', val: '2' },
      { cnj: 'and', attr: 'MaxScore', op: '>', val: '50' },
    ]), events))).toEqual([1, 3]);
    // (m=1 OR m=2) AND score>50 → 1, 3 as well; (m=1 OR m=2) AND score<50 → 2
    expect(ids(evaluateFilter(q([
      { obr: '1', attr: 'MonitorId', op: '=', val: '1' },
      { cnj: 'or', attr: 'MonitorId', op: '=', val: '2', cbr: '1' },
      { cnj: 'and', attr: 'MaxScore', op: '<', val: '50' },
    ]), events))).toEqual([2]);
  });

  it('sort_field / sort_asc / limit follow ZM semantics ("1" = ascending, "0" limit = all)', () => {
    expect(ids(evaluateFilter(q([], { sort_field: 'MaxScore', sort_asc: '1' }), events))).toEqual([2, 3, 1]);
    expect(ids(evaluateFilter(q([], { sort_field: 'StartDateTime', sort_asc: '0' }), events))).toEqual([2, 1, 3]);
    expect(ids(evaluateFilter(q([], { sort_field: 'Id', sort_asc: '0', limit: '2' }), events))).toEqual([3, 2]);
    expect(evaluateFilter(q([], { sort_field: 'Id', sort_asc: '1', limit: '0' }), events)).toHaveLength(3);
  });
});
