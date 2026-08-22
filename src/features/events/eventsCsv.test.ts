import { describe, expect, it } from 'vitest';
import type { ZmEvent } from '@/types';
import { eventsToCsv } from './eventsCsv';

const ev = (over: Partial<ZmEvent>): ZmEvent => ({
  id: 1, monitor_id: 1, storage_id: 0, name: 'New Event', cause: 'Motion',
  start_date_time: '2026-06-02T10:54:35Z', end_date_time: '2026-06-02T10:55:05Z',
  width: 1920, height: 1080, length: '30.00', frames: 300, alarm_frames: 12, default_video: '',
  tot_score: 40, avg_score: 3, max_score: 9, archived: 0, videoed: 0, uploaded: 0, emailed: 1,
  messaged: 0, executed: 0, notes: null, state_id: 1, orientation: 'Rotate0', disk_space: 1024,
  scheme: 'Medium', locked: 0, tags: [{ id: 1, name: 'parcel' }, { id: 2, name: 'night' }],
  ...over,
});

describe('eventsToCsv', () => {
  it('writes the visible columns in order with resolved names and escaped fields', () => {
    const csv = eventsToCsv(
      [ev({}), ev({ id: 2, name: 'Quote "me", please', archived: 1, storage_id: 3 })],
      ['id', 'name', 'archived', 'emailed', 'monitor', 'tags', 'duration', 'storage', 'disk_space'],
      { monitorName: (id) => `Cam ${id}`, storageName: (id) => (id === 0 ? 'Default' : `Store ${id}`) },
    );
    expect(csv.split('\n')).toEqual([
      'Id,Name,Archived,Emailed,Monitor,Tags,Duration,Storage,DiskSpace',
      '1,New Event,No,Yes,Cam 1,parcel night,00:00:30,Default,1024',
      '2,"Quote ""me"", please",Yes,Yes,Cam 1,parcel night,00:00:30,Store 3,1024',
    ]);
  });
});
