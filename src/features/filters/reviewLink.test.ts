import { describe, expect, it } from 'vitest';
import { reviewSearchFromQuery } from './reviewLink';

describe('reviewSearchFromQuery', () => {
  it('carries the monitor and the time bounds over', () => {
    expect(reviewSearchFromQuery({
      terms: [
        { attr: 'MonitorId', op: '=', val: '4' },
        { cnj: 'and', attr: 'StartDateTime', op: '>=', val: '2026-08-21 06:37:03' },
        { cnj: 'and', attr: 'StartDateTime', op: '<=', val: '2026-08-21 07:37:03' },
        { cnj: 'and', attr: 'Cause', op: '=', val: 'Motion' },
      ],
    })).toEqual({
      monitor_id: 4,
      // `resolveDateValue` stamps zoneless values Z; the link is local wall clock.
      min_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
      max_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    });
  });

  it('resolves relative values against now and ignores the rest', () => {
    const now = new Date('2026-08-21T08:00:00Z');
    const out = reviewSearchFromQuery({ terms: [{ attr: 'DateTime', op: '>=', val: '-1 hour' }] }, now);
    expect(out.monitor_id).toBeUndefined();
    expect(out.max_time).toBeUndefined();
    expect(new Date(out.min_time!.replace(' ', 'T')).getTime()).toBe(new Date('2026-08-21T07:00:00Z').getTime());
  });

  it('is empty for terms the review page cannot express', () => {
    expect(reviewSearchFromQuery({ terms: [{ attr: 'Archived', op: '=', val: '1' }] })).toEqual({});
  });
});
