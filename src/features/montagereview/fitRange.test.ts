import { describe, expect, it } from 'vitest';
import { fitRange, type EventSpan } from './fitRange';

const at = (iso: string) => Date.parse(iso);
const span = (start: string, end: string): EventSpan => ({ startMs: at(start), endMs: at(end) });

describe('fitRange', () => {
  it('spans every event with a little padding', () => {
    const r = fitRange(
      [
        span('2026-08-21T10:00:00Z', '2026-08-21T10:10:00Z'),
        span('2026-08-21T12:00:00Z', '2026-08-21T12:30:00Z'),
      ],
      { padFraction: 0 },
    );
    expect(r?.start.toISOString()).toBe('2026-08-21T10:00:00.000Z');
    expect(r?.end.toISOString()).toBe('2026-08-21T12:30:00.000Z');
  });

  it('pads by a fraction of the span', () => {
    const r = fitRange([span('2026-08-21T10:00:00Z', '2026-08-21T11:00:00Z')], { padFraction: 0.1 });
    // 1 h span → 6 min either side.
    expect(r?.start.toISOString()).toBe('2026-08-21T09:54:00.000Z');
    expect(r?.end.toISOString()).toBe('2026-08-21T11:06:00.000Z');
  });

  it('returns null when there is nothing to fit', () => {
    expect(fitRange([])).toBeNull();
    expect(fitRange([{ startMs: NaN, endMs: NaN }])).toBeNull();
    // An end before its start is not a usable span.
    expect(fitRange([{ startMs: at('2026-08-21T12:00:00Z'), endMs: at('2026-08-21T11:00:00Z') }]))
      .toBeNull();
  });

  it('never collapses to less than the minimum window', () => {
    const instant = at('2026-08-21T10:00:00Z');
    const r = fitRange([{ startMs: instant, endMs: instant }], { padFraction: 0, minSpanMs: 60_000 });
    expect(r!.end.getTime() - r!.start.getTime()).toBe(60_000);
    // …and it stays centred on the event.
    expect((r!.start.getTime() + r!.end.getTime()) / 2).toBe(instant);
  });

  it('ignores unusable spans but keeps the good ones', () => {
    const r = fitRange(
      [
        { startMs: NaN, endMs: NaN },
        span('2026-08-21T10:00:00Z', '2026-08-21T10:30:00Z'),
      ],
      { padFraction: 0 },
    );
    expect(r?.start.toISOString()).toBe('2026-08-21T10:00:00.000Z');
    expect(r?.end.toISOString()).toBe('2026-08-21T10:30:00.000Z');
  });
});
