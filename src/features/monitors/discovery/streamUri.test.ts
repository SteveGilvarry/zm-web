import { describe, expect, it } from 'vitest';
import type { InspectResult } from '@/api/discovery';
import { parseStreamUri, prefillFromProfile } from './streamUri';

describe('parseStreamUri', () => {
  it('strips embedded credentials into user/pass and keeps the rest of the URI as the path', () => {
    expect(parseStreamUri('rtsp://admin:s3cret@192.168.1.10:554/Streaming/Channels/101?x=1')).toEqual({
      path: 'rtsp://192.168.1.10:554/Streaming/Channels/101?x=1',
      host: '192.168.1.10', port: '554', user: 'admin', pass: 's3cret',
    });
  });

  it('falls back to the given credentials and the scheme default port', () => {
    expect(parseStreamUri('rtsp://cam.local/live', { user: 'u', pass: 'p' })).toEqual({
      path: 'rtsp://cam.local/live', host: 'cam.local', port: '554', user: 'u', pass: 'p',
    });
    expect(parseStreamUri('http://cam.local/mjpeg')!.port).toBe('80');
    expect(parseStreamUri('https://cam.local/mjpeg')!.port).toBe('443');
  });

  it('decodes percent-encoded credentials and returns null for a non-URL', () => {
    expect(parseStreamUri('rtsp://user:p%40ss@h/x')!.pass).toBe('p@ss');
    expect(parseStreamUri('not a url')).toBeNull();
  });
});

describe('prefillFromProfile', () => {
  const result: InspectResult = {
    device_service: 'http://192.168.1.10/onvif/device_service',
    media_service: 'http://192.168.1.10/onvif/media_service',
    ptz_service: 'http://192.168.1.10/onvif/ptz_service',
    manufacturer: 'HIKVISION', model: 'DS-2CD2087G2-LU', firmware_version: 'V5.7.3',
    profiles: [
      { token: 'Profile_1', name: 'mainStream', encoding: 'H264', width: 3840, height: 2160, stream_uri: 'rtsp://192.168.1.10:554/Streaming/Channels/101' },
      { token: 'Profile_2', name: 'subStream', encoding: 'H264', width: 640, height: 480, stream_uri: null },
    ],
  };

  it('builds an FFmpeg source on the profile stream with the ONVIF endpoint and credentials', () => {
    const out = prefillFromProfile(result, result.profiles[0], { username: 'admin', password: 'pw' });
    expect(out).toEqual({
      type: 'Ffmpeg',
      name: 'HIKVISION DS-2CD2087G2-LU',
      onvif_url: 'http://192.168.1.10/onvif/device_service',
      onvif_username: 'admin', onvif_password: 'pw',
      width: 3840, height: 2160,
      path: 'rtsp://192.168.1.10:554/Streaming/Channels/101', host: '192.168.1.10', port: '554',
      user: 'admin', pass: 'pw',
      controllable: 1, control_device: 'Profile_1',
    });
  });

  it('prefers the probe name, skips the path when the device gave no stream URI, and leaves PTZ off without a PTZ service', () => {
    const out = prefillFromProfile({ ...result, ptz_service: null }, result.profiles[1], { username: '', password: '' }, 'Garage cam');
    expect(out.name).toBe('Garage cam');
    expect(out.width).toBe(640);
    expect('path' in out).toBe(false);
    expect('controllable' in out).toBe(false);
  });
});
