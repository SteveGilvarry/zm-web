import { describe, expect, it } from 'vitest';
import { eventNavSearch, eventsLinkSearch, filterOf, parseTimelineSearch, toLocalInput } from './timelineSearch';

const at = (h: number, m: number, s = 0) => Math.floor(new Date(2026, 7, 21, h, m, s).getTime() / 1000);

describe('parseTimelineSearch', () => {
  it('keeps the events filter and the window, drops the list page and junk', () => {
    expect(parseTimelineSearch({
      monitor_id: '3,4', archived: 'true', tag: '2', notes: 'Motion', q: 'front', page: 4, sort: 'id', dir: 'asc',
      mid_time: '2026-08-21 15:00:00', range: '7200', min_time: '', bogus: 1,
    })).toEqual({
      monitor_id: [3, 4], archived: true, tag: 2, notes: 'Motion', q: 'front', sort: 'id', dir: 'asc',
      mid_time: '2026-08-21 15:00:00', range: 7200,
    });
  });

  it('rejects a range that is not a positive integer', () => {
    expect(parseTimelineSearch({ range: '-5' })).toEqual({});
    expect(parseTimelineSearch({ range: 'week' })).toEqual({});
    expect(parseTimelineSearch({ range: 60 })).toEqual({ range: 60 });
  });
});

describe('links out', () => {
  const s = parseTimelineSearch({ monitor_id: 3, group: 2, archived: 'false', min_time: '2026-08-21 14:00:00', range: 3600 });

  it('strips the window from the filter', () => {
    expect(filterOf(s)).toEqual({ monitor_id: 3, group: 2, archived: false });
  });

  it('List carries the filter plus the chart window as Start/End', () => {
    expect(eventsLinkSearch(s, at(14, 0), at(15, 59, 59))).toEqual({
      monitor_id: 3, group: 2, archived: false, start: '2026-08-21T14:00:00', end: '2026-08-21T15:59:59',
    });
    expect(toLocalInput(at(9, 5, 7))).toBe('2026-08-21T09:05:07');
  });

  it('the event click-through drops the group, as /events/$eventId does', () => {
    expect(eventNavSearch(s)).toEqual({ monitor_id: 3, archived: false });
  });
});
