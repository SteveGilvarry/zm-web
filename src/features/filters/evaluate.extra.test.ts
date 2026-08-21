/**
 * evaluateFilter — the attribute, operator and sort paths the first suite
 * did not reach. Every legacy attribute that the client can know is pulled
 * off an event here, every Tags operator is exercised, and the "not
 * comparable" branches (bad numbers, unparsable dates/times) are pinned to
 * the behaviour zmfilter.pl has: a term that cannot be compared does not
 * match.
 */
import { describe, expect, it } from 'vitest';
import { evaluateFilter, unevaluableAttrs } from './evaluate';
import type { FilterQuery, FilterSortField, FilterTerm } from '@/api/filters';
import type { Monitor, ZmEvent } from '@/types';

const e = (overrides: Partial<ZmEvent>): ZmEvent =>
  ({
    id: 1,
    monitor_id: 1,
    storage_id: 4,
    secondary_storage_id: null,
    name: 'Event',
    cause: 'Motion',
    notes: '',
    archived: 0,
    emailed: 0,
    frames: 100,
    alarm_frames: 3,
    tot_score: 240,
    avg_score: 12,
    max_score: 55,
    disk_space: 1024,
    state_id: 2,
    // 2026-05-24 is a Sunday → MySQL WEEKDAY() 6.
    start_date_time: '2026-05-24T12:00:00Z',
    end_date_time: '2026-05-24T12:01:30Z',
    length: '90.00',
    width: 1920,
    height: 1080,
    orientation: 'Rotate0',
    ...overrides,
  } as unknown as ZmEvent);

const q = (terms: FilterTerm[], rest: Partial<FilterQuery> = {}): FilterQuery => ({ terms, ...rest });
const ids = (out: ZmEvent[]) => out.map((x) => x.id);
const monitors = [{ id: 1, name: 'Front Door' }, { id: 2, name: 'Driveway' }] as unknown as Monitor[];

/** True when the single event survives the single term. */
const matches = (term: FilterTerm, ev = e({})): boolean =>
  evaluateFilter(q([term]), [ev], { monitors }).length === 1;

/* ======================================================================== */
/*  Every client-known attribute                                            */
/* ======================================================================== */

describe('evaluateFilter — attribute coverage', () => {
  it.each<[string, FilterTerm]>([
    ['Id',                 { attr: 'Id', op: '=', val: '1' }],
    ['MonitorId',          { attr: 'MonitorId', op: '=', val: '1' }],
    ['Monitor',            { attr: 'Monitor', op: '=', val: 'front door' }],
    ['MonitorName',        { attr: 'MonitorName', op: 'LIKE', val: 'Front' }],
    ['Name',               { attr: 'Name', op: '=', val: 'event' }],
    ['Cause',              { attr: 'Cause', op: '=', val: 'Motion' }],
    ['Notes',              { attr: 'Notes', op: 'IS', val: 'NULL' }],
    ['DateTime',           { attr: 'DateTime', op: '=', val: '2026-05-24 12:00:00' }],
    ['StartDateTime',      { attr: 'StartDateTime', op: '=', val: '2026-05-24 12:00:00' }],
    ['EndDateTime',        { attr: 'EndDateTime', op: '=', val: '2026-05-24 12:01:30' }],
    ['StartDate',          { attr: 'StartDate', op: '=', val: '2026-05-24' }],
    ['EndDate',            { attr: 'EndDate', op: '=', val: '2026-05-24' }],
    ['StartTime',          { attr: 'StartTime', op: '=', val: '12:00:00' }],
    ['EndTime',            { attr: 'EndTime', op: '=', val: '12:01:30' }],
    ['StartWeekday',       { attr: 'StartWeekday', op: '=', val: '6' }],
    ['EndWeekday',         { attr: 'EndWeekday', op: '=', val: '6' }],
    ['Length',             { attr: 'Length', op: '=', val: '90' }],
    ['Frames',             { attr: 'Frames', op: '=', val: '100' }],
    ['AlarmFrames',        { attr: 'AlarmFrames', op: '=', val: '3' }],
    ['TotScore',           { attr: 'TotScore', op: '=', val: '240' }],
    ['AvgScore',           { attr: 'AvgScore', op: '=', val: '12' }],
    ['MaxScore',           { attr: 'MaxScore', op: '=', val: '55' }],
    ['Archived',           { attr: 'Archived', op: '=', val: '0' }],
    ['Emailed',            { attr: 'Emailed', op: '=', val: '0' }],
    ['StateId',            { attr: 'StateId', op: '=', val: '2' }],
    ['StorageId',          { attr: 'StorageId', op: '=', val: '4' }],
    ['DiskSpace',          { attr: 'DiskSpace', op: '=', val: '1024' }],
  ])('%s reads the matching field off the event', (_name, term) => {
    expect(matches(term)).toBe(true);
  });

  it('SecondaryStorageId reads NULL when the event has no secondary copy', () => {
    expect(matches({ attr: 'SecondaryStorageId', op: 'IS', val: 'NULL' })).toBe(true);
    expect(matches({ attr: 'SecondaryStorageId', op: '=', val: '9' }, e({ secondary_storage_id: 9 }))).toBe(true);
  });

  it('the Current* attributes read the clock, not the event', () => {
    const now = new Date('2026-05-24T12:00:00Z'); // Sunday
    const only = (term: FilterTerm) => evaluateFilter(q([term]), [e({})], { monitors, now }).length;
    expect(only({ attr: 'CurrentDateTime', op: '=', val: '2026-05-24 12:00:00' })).toBe(1);
    expect(only({ attr: 'CurrentDate', op: '=', val: '2026-05-24' })).toBe(1);
    expect(only({ attr: 'CurrentTime', op: '=', val: '12:00:00' })).toBe(1);
    expect(only({ attr: 'CurrentWeekday', op: '=', val: '6' })).toBe(1);
  });

  it('a NULL column compares as not-comparable, so the term does not match', () => {
    const noEnd = e({
      end_date_time: null, avg_score: null, max_score: null, disk_space: null, length: null,
    } as unknown as Partial<ZmEvent>);
    expect(matches({ attr: 'EndDateTime', op: '>', val: '2020-01-01 00:00:00' }, noEnd)).toBe(false);
    expect(matches({ attr: 'EndDate', op: '=', val: '2026-05-24' }, noEnd)).toBe(false);
    expect(matches({ attr: 'EndTime', op: '=', val: '12:01:30' }, noEnd)).toBe(false);
    expect(matches({ attr: 'EndWeekday', op: '=', val: '6' }, noEnd)).toBe(false);
    expect(matches({ attr: 'Length', op: '>', val: '1' }, noEnd)).toBe(false);
    expect(matches({ attr: 'AvgScore', op: '>', val: '1' }, noEnd)).toBe(false);
    expect(matches({ attr: 'MaxScore', op: '>', val: '1' }, noEnd)).toBe(false);
    expect(matches({ attr: 'DiskSpace', op: '>', val: '1' }, noEnd)).toBe(false);
    // …and IS NULL is how you find them.
    expect(matches({ attr: 'EndDateTime', op: 'IS', val: 'NULL' }, noEnd)).toBe(true);
  });

  it('an unknown monitor id yields no name to compare against', () => {
    expect(matches({ attr: 'MonitorName', op: '=', val: 'Front Door' }, e({ monitor_id: 99 }))).toBe(false);
  });
});

/* ======================================================================== */
/*  Values that cannot be compared                                          */
/* ======================================================================== */

describe('evaluateFilter — non-comparable values do not match', () => {
  it('a non-numeric or empty value on a numeric column', () => {
    expect(matches({ attr: 'Frames', op: '>', val: 'lots' })).toBe(false);
    expect(matches({ attr: 'Frames', op: '>', val: '  ' })).toBe(false);
    expect(matches({ attr: 'Frames', op: '<', val: 'lots' })).toBe(false);
  });

  it('an unparsable datetime, on either side of the comparison', () => {
    expect(matches({ attr: 'StartDateTime', op: '>', val: 'yesterday-ish' })).toBe(false);
    // A DATETIME the backend could not stamp leaves NaN on the event side.
    expect(matches(
      { attr: 'StartDateTime', op: '>', val: '2020-01-01 00:00:00' },
      e({ start_date_time: 'not-a-date' }),
    )).toBe(false);
  });

  it('an unparsable time value', () => {
    expect(matches({ attr: 'StartTime', op: '>=', val: 'noon' })).toBe(false);
    expect(matches({ attr: 'StartTime', op: '>=', val: '9:30' })).toBe(true); // normalised to 09:30:00
  });

  it('IS with a numeric value compares numerically, not as NULL', () => {
    expect(matches({ attr: 'Archived', op: 'IS', val: '0' })).toBe(true);
    expect(matches({ attr: 'Archived', op: 'IS', val: '1' })).toBe(false);
    expect(matches({ attr: 'Archived', op: 'IS NOT', val: '1' })).toBe(true);
  });

  it('IS NULL also treats the empty string as unset', () => {
    expect(matches({ attr: 'Notes', op: 'IS', val: '' })).toBe(true);
    expect(matches({ attr: 'Notes', op: 'IS NOT', val: 'NULL' }, e({ notes: 'seen' }))).toBe(true);
  });
});

/* ======================================================================== */
/*  Tags                                                                    */
/* ======================================================================== */

describe('evaluateFilter — Tags operators', () => {
  const tagged = e({ id: 1, tags: [{ id: 5, name: 'Car' }, { id: 6, name: 'Person' }] } as Partial<ZmEvent>);
  const untagged = e({ id: 2, tags: [] } as Partial<ZmEvent>);
  const both = [tagged, untagged];
  const run = (term: FilterTerm) => ids(evaluateFilter(q([term]), both, { monitors }));

  it('= and LIKE test membership by id or by name, case-insensitively', () => {
    expect(run({ attr: 'Tags', op: '=', val: '5' })).toEqual([1]);
    expect(run({ attr: 'Tags', op: '=', val: ' car ' })).toEqual([1]);
    expect(run({ attr: 'Tags', op: 'LIKE', val: 'PERSON' })).toEqual([1]);
  });

  it('!= and NOT LIKE invert membership', () => {
    expect(run({ attr: 'Tags', op: '!=', val: 'Car' })).toEqual([2]);
    expect(run({ attr: 'Tags', op: 'NOT LIKE', val: '5' })).toEqual([2]);
  });

  it('=[] and ![] take a comma-separated list', () => {
    expect(run({ attr: 'Tags', op: '=[]', val: 'Bike, Person' })).toEqual([1]);
    expect(run({ attr: 'Tags', op: '=[]', val: 'Bike, Bus' })).toEqual([]);
    expect(run({ attr: 'Tags', op: '![]', val: 'Bike, Person' })).toEqual([2]);
  });

  it('IS / IS NOT ask whether the event carries any tag at all', () => {
    expect(run({ attr: 'Tags', op: 'IS', val: 'NULL' })).toEqual([2]);
    expect(run({ attr: 'Tags', op: 'IS NOT', val: 'NULL' })).toEqual([1]);
  });

  it('an operator with no Tags meaning is treated as unevaluable, so everything matches', () => {
    expect(run({ attr: 'Tags', op: '>', val: '5' })).toEqual([1, 2]);
  });

  it('an event with no tags array at all reads as untagged', () => {
    expect(evaluateFilter(q([{ attr: 'Tags', op: 'IS', val: 'NULL' }]), [e({ id: 7 })])).toHaveLength(1);
  });
});

/* ======================================================================== */
/*  Sorting                                                                 */
/* ======================================================================== */

describe('evaluateFilter — sort fields', () => {
  const rows = [
    e({ id: 3, monitor_id: 2, name: 'Charlie', cause: 'Continuous', notes: 'zzz', disk_space: 30, frames: 3, alarm_frames: 30, tot_score: 3, avg_score: 30, max_score: 3, length: '30', end_date_time: '2026-05-24T13:00:00Z', tags: [{ id: 1, name: 'car' }] } as Partial<ZmEvent>),
    e({ id: 1, monitor_id: 1, name: 'Alpha', cause: 'Motion', notes: 'aaa', disk_space: 10, frames: 1, alarm_frames: 10, tot_score: 1, avg_score: 10, max_score: 1, length: '10', end_date_time: '2026-05-24T11:00:00Z', tags: [{ id: 2, name: 'bike' }] } as Partial<ZmEvent>),
    e({ id: 2, monitor_id: 2, name: 'Bravo', cause: 'Signal', notes: 'mmm', disk_space: 20, frames: 2, alarm_frames: 20, tot_score: 2, avg_score: 20, max_score: 2, length: '20', end_date_time: '2026-05-24T12:00:00Z', tags: [] } as Partial<ZmEvent>),
  ];
  const sortedIds = (field: FilterSortField, asc = '1') =>
    ids(evaluateFilter(q([], { sort_field: field, sort_asc: asc }), rows, { monitors }));

  it.each<[FilterSortField, number[]]>([
    ['Id', [1, 2, 3]],
    ['Name', [1, 2, 3]],
    ['Cause', [3, 1, 2]],
    ['Notes', [1, 2, 3]],
    ['DiskSpace', [1, 2, 3]],
    ['EndDateTime', [1, 2, 3]],
    ['Length', [1, 2, 3]],
    ['Frames', [1, 2, 3]],
    ['AlarmFrames', [1, 2, 3]],
    ['TotScore', [1, 2, 3]],
    ['AvgScore', [1, 2, 3]],
    ['MaxScore', [1, 2, 3]],
  ])('sorts ascending by %s', (field, expected) => {
    expect(sortedIds(field)).toEqual(expected);
  });

  it('sorts by MonitorName through the monitors list', () => {
    // Driveway < Front Door; events 3 and 2 share a monitor and keep their
    // original relative order (Array#sort is stable).
    expect(sortedIds('MonitorName')).toEqual([3, 2, 1]);
  });

  it('sorts by Tags on the joined tag names, empty first', () => {
    expect(sortedIds('Tags')).toEqual([2, 1, 3]);
  });

  it('sorts descending when sort_asc is not "1"', () => {
    expect(sortedIds('Id', '0')).toEqual([3, 2, 1]);
  });

  it('an unknown sort field leaves every key null, so the order is stable', () => {
    expect(sortedIds('Nonsense' as FilterSortField)).toEqual([3, 1, 2]);
  });

  it('nulls sort before values, on either side of the comparison', () => {
    const withNulls = [
      e({ id: 1, cause: null } as Partial<ZmEvent>),
      e({ id: 2, cause: 'Motion' }),
      e({ id: 3, cause: null } as Partial<ZmEvent>),
    ];
    expect(ids(evaluateFilter(q([], { sort_field: 'Cause', sort_asc: '1' }), withNulls)))
      .toEqual([1, 3, 2]);
    expect(ids(evaluateFilter(q([], { sort_field: 'Cause', sort_asc: '0' }), withNulls)))
      .toEqual([2, 1, 3]);
  });

  it('a non-numeric limit is ignored', () => {
    expect(ids(evaluateFilter(q([], { sort_field: 'Id', sort_asc: '1', limit: 'all' }), rows)))
      .toEqual([1, 2, 3]);
    expect(ids(evaluateFilter(q([], { sort_field: 'Id', sort_asc: '1', limit: '2' }), rows)))
      .toEqual([1, 2]);
  });
});

/* ======================================================================== */
/*  unevaluableAttrs                                                        */
/* ======================================================================== */

describe('unevaluableAttrs', () => {
  it('names each server-only attribute once, plus anything it does not recognise', () => {
    const out = unevaluableAttrs(q([
      { attr: 'DiskPercent', op: '>', val: '80' },
      { attr: 'DiskPercent', op: '<', val: '95' },
      { attr: 'Group', op: '=', val: '2' },
      { attr: 'SomethingElse', op: '=', val: 'x' } as unknown as FilterTerm,
      { attr: 'Cause', op: '=', val: 'Motion' },
    ]));
    expect(out).toEqual(['DiskPercent', 'Group', 'SomethingElse']);
  });

  it('an attribute it cannot evaluate never excludes an event', () => {
    expect(matches({ attr: 'SystemLoad', op: '>', val: '99' })).toBe(true);
    expect(matches({ attr: 'NotAnAttribute', op: '=', val: 'x' } as unknown as FilterTerm)).toBe(true);
  });
});
