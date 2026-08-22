import { describe, expect, it } from 'vitest';
import type { MonitorPreset } from '@/api/monitorPresets';
import { applyPreset } from './applyPreset';

// Copied from GET /monitor_presets on the dev box (id 1), including the
// literal "NULL" string the seed data stores in `host`.
const amcrest: MonitorPreset = {
  id: 1, model_id: null, name: 'Amcrest, IP8M-T2499EW 640x480, RTP/RTSP', type: 'Ffmpeg',
  device: 'rtsp', channel: 0, format: 255, protocol: 'rtsp', method: 'rtpRtsp', host: 'NULL', port: '554',
  path: 'rtsp://<username>:<password>@<ip-address>/cam/realmonitor?channel=1&subtype=1', sub_path: null,
  width: 640, height: 480, palette: 3, max_fps: null, controllable: 0, control_id: null,
  control_device: null, control_address: null, default_rate: 100, default_scale: '100',
};

describe('applyPreset', () => {
  it('copies the legacy column set and drops the NULL sentinel / empty columns', () => {
    const out = applyPreset(amcrest);
    expect(out).toEqual({
      type: 'Ffmpeg', device: 'rtsp', protocol: 'rtsp', method: 'rtpRtsp', port: '554',
      path: 'rtsp://<username>:<password>@<ip-address>/cam/realmonitor?channel=1&subtype=1',
      default_scale: '100', channel: 0, format: 255, width: 640, height: 480, palette: 3,
      controllable: 0, default_rate: 100,
    });
    expect('host' in out).toBe(false);
    expect('max_fps' in out).toBe(false);
  });

  it('turns the text control_id into the integer FK and canonicalises the type', () => {
    const out = applyPreset({ ...amcrest, type: 'FFMPEG', control_id: '12', controllable: 1, control_device: 'Profile_1' });
    expect(out.type).toBe('Ffmpeg');
    expect(out.control_id).toBe(12);
    expect(out.controllable).toBe(1);
    expect(out.control_device).toBe('Profile_1');
  });

  it('ignores a type outside the request enum and a non-numeric control_id', () => {
    const out = applyPreset({ ...amcrest, type: 'NVSocket', control_id: 'onvif' });
    expect('type' in out).toBe(false);
    expect('control_id' in out).toBe(false);
  });
});
