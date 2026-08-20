import { describe, expect, it } from 'vitest';
import { parseEventsSearch, termsFromEventsSearch, toZmDateTime } from './eventsSearch';

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

  it('rejects sort fields the backend does not know', () => {
    expect(parseEventsSearch({ sort: 'name', dir: 'sideways', page: 0 })).toEqual({});
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

  it('leaves page-local free text out', () => {
    expect(termsFromEventsSearch({ q: 'door', page: 3 })).toEqual([]);
  });
});

describe('toZmDateTime', () => {
  it('accepts datetime-local and ISO shapes', () => {
    expect(toZmDateTime('2026-08-21T06:37')).toBe('2026-08-21 06:37:00');
    expect(toZmDateTime('2026-08-21T06:37:03Z')).toBe('2026-08-21 06:37:03');
    expect(toZmDateTime('garbage')).toBe('garbage');
  });
});
