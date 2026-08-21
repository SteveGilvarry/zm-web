import { describe, expect, it } from 'vitest';
import { alarmSoundUrl, isAlarming, newlyAlarming, statusMap } from './alarmWatch';
import type { MonitorStatusRecord } from '@/api/monitorStatus';

const s = (monitor_id: number, status: string) => ({ monitor_id, status }) as MonitorStatusRecord;

describe('newlyAlarming', () => {
  it('fires on the transition into Alarm, not while it stays there', () => {
    const before = statusMap([s(1, 'Connected'), s(2, 'Connected')]);
    const first = newlyAlarming(before, [s(1, 'Alarm'), s(2, 'Connected')]);
    expect(first).toEqual([1]);

    const during = statusMap([s(1, 'Alarm'), s(2, 'Connected')]);
    expect(newlyAlarming(during, [s(1, 'Alarm'), s(2, 'Connected')])).toEqual([]);
  });

  it('treats Alert as alarming and re-fires after it clears', () => {
    expect(newlyAlarming(statusMap([s(3, 'Connected')]), [s(3, 'Alert')])).toEqual([3]);
    const cleared = statusMap([s(3, 'Connected')]);
    expect(newlyAlarming(cleared, [s(3, 'Alarm')])).toEqual([3]);
  });

  it('fires for a monitor seen alarming on the very first snapshot', () => {
    expect(newlyAlarming(new Map(), [s(4, 'Alarm')])).toEqual([4]);
  });

  it('reports every monitor that transitioned', () => {
    const before = statusMap([s(1, 'Connected'), s(2, 'Alarm'), s(3, 'Connected')]);
    expect(newlyAlarming(before, [s(1, 'Alarm'), s(2, 'Alarm'), s(3, 'Alert')])).toEqual([1, 3]);
  });
});

describe('isAlarming / alarmSoundUrl', () => {
  it('recognises the alarming states', () => {
    expect(isAlarming(s(1, 'Alarm'))).toBe(true);
    expect(isAlarming(s(1, 'Alert'))).toBe(true);
    expect(isAlarming(s(1, 'Connected'))).toBe(false);
    expect(isAlarming(undefined)).toBe(false);
  });

  it('points at legacy’s sounds directory and escapes the name', () => {
    expect(alarmSoundUrl('snap.ogg')).toBe('/zm/sounds/snap.ogg');
    expect(alarmSoundUrl('my sound.wav')).toBe('/zm/sounds/my%20sound.wav');
  });
});
