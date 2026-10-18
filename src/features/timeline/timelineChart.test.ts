import { describe, expect, it } from 'vitest';
import { makeEvent, makeMonitor } from '@/test/fixtures';
import type { Frame } from '@/api/frames';
import {
  alignWindow,
  buildChart,
  DEFAULT_MONITOR_COLOUR,
  formatDbTime,
  getDateScale,
  getYScale,
  parseWhen,
  phpDate,
  rangeTitle,
  requestedWindow,
  xGrid,
} from './timelineChart';

/** Local wall clock → Unix seconds, so the tests hold in any zone. */
const at = (h: number, m: number, s = 0, day = 21) => Math.floor(new Date(2026, 7, day, h, m, s).getTime() / 1000);
const iso = (t: number) => new Date(t * 1000).toISOString();

describe('getDateScale', () => {
  it('picks the coarsest scale with at least four lines', () => {
    const s = getDateScale(7200);
    expect(s.name).toBe('minute10');
    expect(s.range).toBe(12);
    expect(s.divisor).toBe(1);
  });

  it('raises the divisor until at most twelve lines remain', () => {
    const s = getDateScale(3 * 86400);
    expect(s.name).toBe('hour4');
    expect(s.range).toBe(18);
    expect(s.divisor).toBe(2);
    expect(s.lines).toBe(9);
  });

  it('falls through to seconds for a tiny range', () => {
    expect(getDateScale(2).name).toBe('second');
  });
});

describe('getYScale', () => {
  it('keeps at most eight score lines', () => {
    expect(getYScale(81)).toEqual({ divisor: 11, lines: 8 });
    expect(getYScale(5)).toEqual({ divisor: 1, lines: 5 });
  });
});

describe('phpDate / parseWhen / formatDbTime', () => {
  it('formats the subset of PHP date() the timeline uses', () => {
    const t = at(14, 5, 9);
    expect(phpDate('Y-m-d H:i:s', t)).toBe('2026-08-21 14:05:09');
    expect(phpDate('d M Y', t)).toBe('21 Aug 2026');
    expect(phpDate('d/m', t)).toBe('21/08');
    expect(phpDate('W', t)).toBe('34');
  });

  it('reads legacy local times and ISO stamps', () => {
    expect(parseWhen('2026-08-21 14:05:09')).toBe(at(14, 5, 9));
    expect(parseWhen('2026-08-21T14:05')).toBe(at(14, 5));
    expect(parseWhen(iso(at(14, 5)))).toBe(at(14, 5));
    expect(parseWhen('soon')).toBeUndefined();
    expect(parseWhen(undefined)).toBeUndefined();
    expect(formatDbTime(at(9, 0))).toBe('2026-08-21 09:00:00');
  });
});

describe('requestedWindow', () => {
  it('centres a range on midTime, losing a second at the far edge', () => {
    expect(requestedWindow({ mid_time: '2026-08-21 15:00:00', range: 7200 }))
      .toEqual({ minT: at(14, 0), maxT: at(15, 59, 59) });
  });

  it('runs a range forward from minTime or back from maxTime', () => {
    expect(requestedWindow({ min_time: '2026-08-21 14:00:00', range: 3600 }))
      .toEqual({ minT: at(14, 0), maxT: at(15, 0) });
    expect(requestedWindow({ max_time: '2026-08-21 15:00:00', range: 3600 }))
      .toEqual({ minT: at(14, 0), maxT: at(15, 0) });
  });

  it('leaves the window to the events when a range has no anchor', () => {
    expect(requestedWindow({ range: 3600 })).toEqual({});
  });

  it('takes minTime and maxTime as given', () => {
    expect(requestedWindow({ min_time: '2026-08-21 14:00:00' })).toEqual({ minT: at(14, 0), maxT: undefined });
  });
});

describe('alignWindow', () => {
  it('snaps outwards to whole scale units', () => {
    const w = alignWindow(at(14, 3), at(15, 55), at(23, 0));
    expect(w.scale.name).toBe('minute10');
    expect(w.lo).toBe(at(14, 0));
    expect(w.hi).toBe(at(15, 59, 59));
    expect(w.range).toBe(7200);
    expect(w.mid).toBe(at(15, 0));
  });

  it('never runs past now', () => {
    expect(alignWindow(at(14, 0), at(15, 59, 59), at(15, 30)).hi).toBe(at(15, 30));
  });
});

describe('rangeTitle', () => {
  it('names only what differs', () => {
    expect(rangeTitle(at(14, 0), at(15, 59, 59))).toBe('14:00 - 15:59, 21 Aug 2026');
    expect(rangeTitle(at(0, 0, 0, 20), at(23, 0, 0, 22))).toBe('20 - 22 Aug 2026');
    const sep = Math.floor(new Date(2026, 8, 2).getTime() / 1000);
    expect(rangeTitle(at(0, 0), sep)).toBe('Aug - Sep 2026');
    const next = Math.floor(new Date(2027, 0, 2).getTime() / 1000);
    expect(rangeTitle(at(0, 0), next)).toBe('Aug 2026 - Jan 2027');
  });
});

describe('xGrid', () => {
  it('puts a tick on every ten minutes of a two-hour window, with a zoom band between each pair', () => {
    const { ticks, bands } = xGrid(alignWindow(at(14, 0), at(15, 59, 59), at(23, 0)));
    expect(ticks.map((t) => t.label)).toEqual([
      '14:10', '14:20', '14:30', '14:40', '14:50', '15:00', '15:10', '15:20', '15:30', '15:40', '15:50',
    ]);
    expect(ticks[0].x).toBeCloseTo(8.3, 1);
    expect(bands).toHaveLength(12);
    expect(bands[0]).toMatchObject({ minT: at(14, 0), maxT: at(14, 10) });
    expect(bands[11]).toMatchObject({ minT: at(15, 50), maxT: at(16, 0) });
  });
});

describe('buildChart', () => {
  const win = alignWindow(at(14, 0), at(15, 59, 59), at(23, 0));
  const monitors = [
    makeMonitor({ id: 1, name: 'Front', web_colour: '#ff0000' }),
    makeMonitor({ id: 2, name: 'Back', web_colour: '' }),
  ];
  const short = makeEvent({ id: 10, monitor_id: 1, start_date_time: iso(at(14, 10)), end_date_time: iso(at(14, 10, 30)), max_score: 0, frames: 30 });
  const long = makeEvent({ id: 11, monitor_id: 1, start_date_time: iso(at(15, 0)), end_date_time: iso(at(15, 2)), max_score: 80, frames: 121 });
  const blip = makeEvent({ id: 12, monitor_id: 2, start_date_time: iso(at(14, 30, 5)), end_date_time: iso(at(14, 30, 8)), max_score: 40 });
  const frames: Frame[] = [
    { id: 1, event_id: 11, frame_id: 10, type: 'Alarm', score: 80, time_stamp: iso(at(15, 0, 10)), delta: '10' },
    { id: 2, event_id: 11, frame_id: 60, type: 'Alarm', score: 20, time_stamp: iso(at(15, 1)), delta: '60' },
  ];
  const chart = buildChart({
    window: win, events: [long, blip, short], framesByEvent: new Map([[11, frames]]), monitors, nowT: at(23, 0),
  });

  it('gives each monitor with events one row in its colour, fallback for none', () => {
    expect(chart.rows.map((r) => [r.monitorId, r.name, r.colour])).toEqual([
      [1, 'Front', '#ff0000'],
      [2, 'Back', DEFAULT_MONITOR_COLOUR],
    ]);
  });

  it('sizes the bars so two monitors fill at least 40 px and stacks them under the strip', () => {
    expect(chart.eventBarHeight).toBe(20);
    expect(chart.eventsHeight).toBe(41);
    expect(chart.activityHeight).toBe(119);
    expect(chart.rows.map((r) => r.top)).toEqual([119, 140]);
  });

  it('merges a short event into one piece and splits a long one every six slots', () => {
    const slots = chart.rows[0].slots.map((s) => ({ id: s.event.id, index: s.index, width: s.width, frame: s.frame }));
    expect(slots).toEqual([
      { id: 10, index: 50, width: 3, frame: 1 },
      { id: 11, index: 300, width: 6, frame: 1 },
      // The second piece previews the frame it starts on.
      { id: 11, index: 306, width: 5, frame: 73 },
    ]);
    expect(chart.rows[1].slots).toEqual([expect.objectContaining({ index: 150, width: 1 })]);
  });

  it('puts scored frames in the activity strip, and MaxScore where frames are unknown', () => {
    expect(chart.activity.map((a) => [a.index, a.value, a.frame, a.monitorId])).toEqual([
      [150, 40, 'alarm', 2],
      [300, 80, 10, 1],
      [305, 20, 60, 1],
    ]);
    expect(chart.activityHeightOf(80)).toBe(117);
    expect(chart.yTicks).toHaveLength(8);
    expect(chart.title).toBe('14:00 - 15:59, 21 Aug 2026');
  });

  it('runs an event still recording up to now and draws nothing for an empty window', () => {
    const live = makeEvent({ id: 13, monitor_id: 1, start_date_time: iso(at(15, 50)), end_date_time: null, max_score: 0 });
    const c = buildChart({ window: win, events: [live], monitors, nowT: at(15, 59, 59) });
    expect(c.rows[0].slots[0]).toMatchObject({ index: 550 });
    const empty = buildChart({ window: win, events: [], monitors, nowT: at(23, 0) });
    expect(empty.rows).toEqual([]);
    expect(empty.eventsHeight).toBe(40);
  });
});
