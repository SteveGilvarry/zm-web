import { describe, expect, it } from 'vitest';
import { MONITOR_CREATE_DEFAULTS } from '@/api/monitors-crud';
import type { Monitor } from '@/types';
import { cloneName, cloneSeed, newMonitorName, newMonitorSeed, LEGACY_NEW_MONITOR } from './newMonitor';

const existing = [
  { id: 3, name: 'Gate' },
  { id: 68, name: 'Porch' },
] as Pick<Monitor, 'id' | 'name'>[];

describe('newMonitorName', () => {
  it('takes the next id after the highest one', () => {
    expect(newMonitorName(existing)).toBe('Monitor-69');
    expect(newMonitorName([])).toBe('Monitor-1');
  });

  it('appends 0 until the name is free, as monitor.php does', () => {
    expect(newMonitorName([...existing, { id: 1, name: 'Monitor-69' }, { id: 2, name: 'Monitor-690' }] as never))
      .toBe('Monitor-6900');
  });

  it('uses the translated prefix', () => {
    expect(newMonitorName(existing, 'Kamera')).toBe('Kamera-69');
  });
});

describe('cloneName', () => {
  it('prefixes "Clone of " until free', () => {
    expect(cloneName('Cam', [])).toBe('Clone of Cam');
    expect(cloneName('Cam', ['Clone of Cam'])).toBe('Clone of Clone of Cam');
  });
});

describe('newMonitorSeed', () => {
  it('is the row defaults with the box’s new-monitor values on top', () => {
    const { values } = newMonitorSeed(existing, {}, { rand: () => 0.5 });
    expect(values.name).toBe('Monitor-69');
    expect(values.max_image_buffer_count).toBe(121);
    expect(values.pre_event_count).toBe(5);
    expect(values.event_close_mode).toBe('system');
    expect(values.web_colour).toBe('#7fffff');
    // Everything else is the create default, so the body stays complete.
    expect(Object.keys(values).sort()).toEqual(Object.keys(MONITOR_CREATE_DEFAULTS).sort());
    expect(values.image_buffer_count).toBe(MONITOR_CREATE_DEFAULTS.image_buffer_count);
  });

  it('lays a prefill over it, skipping blanks', () => {
    const { values } = newMonitorSeed(existing, { name: '', path: 'rtsp://cam/1', width: 640 });
    expect(values.name).toBe('Monitor-69');
    expect(values.path).toBe('rtsp://cam/1');
    expect(values.width).toBe(640);
  });

  it('only overrides keys the create request has', () => {
    for (const k of Object.keys(LEGACY_NEW_MONITOR)) expect(k in MONITOR_CREATE_DEFAULTS).toBe(true);
  });
});

describe('cloneSeed', () => {
  it('copies the source, renames it and carries its groups', () => {
    const src = { ...MONITOR_CREATE_DEFAULTS, id: 3, name: 'Gate', path: 'rtsp://gate/1', deleted: false } as unknown as Monitor;
    const seed = cloneSeed(src, existing);
    expect(seed.values.name).toBe('Clone of Gate');
    expect(seed.values.path).toBe('rtsp://gate/1');
    expect(seed.clonedFrom).toBe('Gate');
    expect(seed.groupsFrom).toBe(3);
    expect('id' in seed.values).toBe(false);
  });
});
