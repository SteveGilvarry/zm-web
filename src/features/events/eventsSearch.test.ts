import { describe, expect, it } from 'vitest';
import {
  monitorIdsFromSearch,
  monitorIdsToSearch,
  parseEventsSearch,
  termsFromEventsSearch,
  toApiTimestamp,
  toZmDateTime,
} from './eventsSearch';

describe('parseEventsSearch', () => {
  it('coerces strings and drops anything malformed', () => {
    expect(parseEventsSearch({
      monitor_id: '4', page: '2', page_size: 50, sort: 'start_time', dir: 'desc',
      archived: 'true', start: '2026-08-21T06:37', q: 'door', tag: 'x', cause: '',
    })).toEqual({
      monitor_id: 4, page: 2, page_size: 50, sort: 'start_time', dir: 'desc',
      archived: true, start: '2026-08-21T06:37', q: 'door',
    });
  });

  it('reads the storage filter and drops a malformed one', () => {
    expect(parseEventsSearch({ storage: '2' }).storage).toBe(2);
    expect(parseEventsSearch({ storage: 'x' }).storage).toBeUndefined();
  });

  it('reads the monitor filter as one id, a comma list or an array', () => {
    expect(monitorIdsFromSearch({ monitor_id: 4 })).toEqual([4]);
    expect(monitorIdsFromSearch({ monitor_id: '1,2' as unknown as number })).toEqual([1, 2]);
    expect(monitorIdsFromSearch({ monitor_id: [1, 2] })).toEqual([1, 2]);
    // Duplicates collapse and junk is dropped rather than thrown.
    expect(monitorIdsFromSearch({ monitor_id: ['2', 'x', '2', '0'] as unknown as number[] }))
      .toEqual([2]);
    expect(monitorIdsFromSearch({})).toEqual([]);
  });

  it('round-trips the monitor filter: one id stays a bare number', () => {
    expect(monitorIdsToSearch([])).toBeUndefined();
    expect(monitorIdsToSearch([4])).toBe(4);
    expect(monitorIdsToSearch([1, 2])).toEqual([1, 2]);
    expect(parseEventsSearch({ monitor_id: '1,2' }).monitor_id).toEqual([1, 2]);
    expect(parseEventsSearch({ monitor_id: ['1', '2'] }).monitor_id).toEqual([1, 2]);
    expect(parseEventsSearch({ monitor_id: ['2'] }).monitor_id).toBe(2);
  });

  it('rejects sort fields the backend does not know', () => {
    expect(parseEventsSearch({ sort: 'disk_space', dir: 'sideways', page: 0 })).toEqual({});
  });

  it('accepts the sort fields zm-api#20 added', () => {
    for (const sort of ['name', 'cause', 'monitor_id', 'notes', 'frames']) {
      expect(parseEventsSearch({ sort }).sort).toBe(sort);
    }
  });

  it('reads archived=false and numeric booleans', () => {
    expect(parseEventsSearch({ archived: false }).archived).toBe(false);
    expect(parseEventsSearch({ archived: '0' }).archived).toBe(false);
    expect(parseEventsSearch({ archived: '1' }).archived).toBe(true);
  });
});

describe('termsFromEventsSearch', () => {
  it('turns the list filters into ZoneMinder terms, first term without cnj', () => {
    const terms = termsFromEventsSearch({
      monitor_id: 2, start: '2026-08-21T06:37', end: '2026-08-21T07:37:03', archived: false, notes: 'parcel',
    });
    expect(terms).toEqual([
      { obr: '0', attr: 'MonitorId', op: '=', val: '2', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'StartDateTime', op: '>=', val: '2026-08-21 06:37:00', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'StartDateTime', op: '<=', val: '2026-08-21 07:37:03', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'Notes', op: 'LIKE', val: 'parcel', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'Archived', op: '=', val: '0', cbr: '0' },
    ]);
  });

  it('writes several monitors as ZoneMinder\'s MonitorId =[] term', () => {
    expect(termsFromEventsSearch({ monitor_id: [1, 2] })).toEqual([
      { obr: '0', attr: 'MonitorId', op: '=[]', val: '1,2', cbr: '0' },
    ]);
  });

  it('carries the storage filter as a StorageId term', () => {
    expect(termsFromEventsSearch({ storage: 2 })).toEqual([
      { obr: '0', attr: 'StorageId', op: '=', val: '2', cbr: '0' },
    ]);
  });

  it('maps the name and cause substring boxes onto LIKE terms', () => {
    expect(termsFromEventsSearch({ q: 'door', cause: 'Motion', page: 3 })).toEqual([
      { obr: '0', attr: 'Cause', op: 'LIKE', val: 'Motion', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'Name', op: 'LIKE', val: 'door', cbr: '0' },
    ]);
  });
});

describe('toZmDateTime', () => {
  it('accepts datetime-local and ISO shapes', () => {
    expect(toZmDateTime('2026-08-21T06:37')).toBe('2026-08-21 06:37:00');
    expect(toZmDateTime('2026-08-21T06:37:03Z')).toBe('2026-08-21 06:37:03');
    expect(toZmDateTime('garbage')).toBe('garbage');
  });
});

describe('toApiTimestamp', () => {
  it('passes a stamp that already carries a zone straight through', () => {
    expect(toApiTimestamp('2026-08-21T06:37:03Z')).toBe('2026-08-21T06:37:03Z');
    expect(toApiTimestamp('2026-08-21T06:37:03+10:00')).toBe('2026-08-21T06:37:03+10:00');
  });

  it('reads a bare date or wall clock as local time', () => {
    const midnight = new Date('2026-08-21T00:00');
    expect(toApiTimestamp('2026-08-21')).toBe(midnight.toISOString().replace(/\.\d{3}Z$/, 'Z'));
    const wall = new Date('2026-08-21T06:37');
    expect(toApiTimestamp('2026-08-21T06:37')).toBe(wall.toISOString().replace(/\.\d{3}Z$/, 'Z'));
  });

  it('gives back nothing for an empty or unparseable value', () => {
    expect(toApiTimestamp('')).toBe('');
    expect(toApiTimestamp('garbage')).toBe('');
  });
});
