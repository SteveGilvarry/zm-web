import { describe, expect, it } from 'vitest';
import type { ZmEvent } from '@/types';
import { eventAuditWindow } from './useEventFileCheck';
import { maxScoreFrameParams } from './maxScoreLink';

const ev = (over: Partial<ZmEvent>) => ({ id: 1, monitor_id: 4, ...over }) as ZmEvent;

describe('eventAuditWindow', () => {
  it('spans the event, start to end, on its monitor', () => {
    expect(eventAuditWindow(ev({ start_date_time: '2026-10-19T05:58:32Z', end_date_time: '2026-10-19T06:08:32Z' })))
      .toEqual({ start: '2026-10-19T05:58:32Z', end: '2026-10-19T06:08:32Z', monitor_id: 4 });
  });
  it('runs to start plus length while the event is still recording', () => {
    expect(eventAuditWindow(ev({ start_date_time: '2026-10-19T14:07:57Z', end_date_time: null, length: '169.92' })))
      .toEqual({ start: '2026-10-19T14:07:57Z', end: '2026-10-19T14:10:46Z', monitor_id: 4 });
  });
  it('has nothing to ask without a start time', () => {
    expect(eventAuditWindow(ev({ start_date_time: null as unknown as string }))).toBeNull();
    expect(eventAuditWindow(ev({ start_date_time: 'garbage' }))).toBeNull();
  });
});

describe('maxScoreFrameParams', () => {
  it('names the frame zm-api reports, else frame 0', () => {
    expect(maxScoreFrameParams({ id: 9, max_score_frame_id: 31 })).toEqual({ eventId: '9', frameId: '31' });
    expect(maxScoreFrameParams({ id: 9, max_score_frame_id: null })).toEqual({ eventId: '9', frameId: '0' });
    expect(maxScoreFrameParams({ id: 9 })).toEqual({ eventId: '9', frameId: '0' });
  });
});
