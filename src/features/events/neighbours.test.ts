import { describe, expect, it } from 'vitest';
import { pickNextEvent, pickPrevEvent } from './useEventDetailPage';

const ev = (id: number, start: string | null) => ({ id, start_date_time: start });

// Shapes the dev box returns for monitor 4's event 28803 (10-minute
// continuous recordings, one monitor) and for the all-monitor scope where
// monitor 1's events overlap monitor 4's by a few seconds.
describe('pickNextEvent', () => {
  it('returns the first event after the current one from the ascending window', () => {
    const cur = ev(28803, '2026-08-21T00:20:11Z');
    expect(pickNextEvent(cur, [cur, ev(28805, '2026-08-21T00:30:11Z')])).toBe(28805);
  });

  it('skips the current event and same-second siblings with lower ids', () => {
    const cur = ev(50, '2026-08-21T00:20:11Z');
    const win = [ev(49, '2026-08-21T00:20:11Z'), cur, ev(51, '2026-08-21T00:20:11Z')];
    expect(pickNextEvent(cur, win)).toBe(51);
  });

  it('returns null at the newest event or without a start time', () => {
    const cur = ev(28893, '2026-08-21T07:50:10Z');
    expect(pickNextEvent(cur, [cur])).toBeNull();
    expect(pickNextEvent(ev(1, null), [ev(2, '2026-08-21T00:00:00Z')])).toBeNull();
  });
});

describe('pickPrevEvent', () => {
  it('returns the anchor when nothing started between it and the current event', () => {
    const cur = ev(28803, '2026-08-21T00:20:11Z');
    const anchor = ev(28801, '2026-08-21T00:10:11Z');
    expect(pickPrevEvent(cur, [anchor, cur, ev(28805, '2026-08-21T00:30:11Z')])).toBe(28801);
  });

  it('prefers an overlapping event on another monitor that the end_time bound skipped', () => {
    // 28802 (monitor 1) started after the anchor but was still running when
    // 28803 began, so `end_date_time <= start` never returns it.
    const cur = ev(28803, '2026-08-21T00:20:11Z');
    const anchor = ev(28801, '2026-08-21T00:10:11Z');
    const overlapping = ev(28802, '2026-08-21T00:20:04Z');
    expect(pickPrevEvent(cur, [anchor, overlapping, cur])).toBe(28802);
  });

  it('never returns the current event itself, even when it is the anchor', () => {
    const cur = ev(99, '2026-06-02T12:00:00Z');
    expect(pickPrevEvent(cur, [cur, ev(100, '2026-06-02T12:00:00Z')])).toBeNull();
  });

  it('breaks same-second ties by id', () => {
    const cur = ev(50, '2026-08-21T00:20:11Z');
    expect(pickPrevEvent(cur, [ev(48, '2026-08-21T00:20:11Z'), ev(49, '2026-08-21T00:20:11Z'), cur])).toBe(49);
  });
});
