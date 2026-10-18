import { describe, expect, it } from 'vitest';
import { legacyErrors, legacyWarnings, splitPathCredentials } from './legacyValidation';

const t = (k: string) => k;
const none = { names: new Set<string>(), rtspStreamNames: new Set<string>() };
const ok = { type: 'Ffmpeg', name: 'Gate', path: 'rtsp://cam/1', image_buffer_count: 3, section_length: 600 };

describe('legacyErrors', () => {
  it('is clean for a sane Ffmpeg monitor', () => {
    expect(legacyErrors(ok, none, t)).toEqual({});
  });

  it('names: bad characters listed once, duplicates refused', () => {
    expect(legacyErrors({ ...ok, name: 'Gate #1 & #2' }, none, t).name).toMatch(/such as: "#","&"\./);
    expect(legacyErrors({ ...ok, name: 'Café (east) 1/2: a-b_c.d' }, none, t)).toEqual({});
    expect(legacyErrors(ok, { ...none, names: new Set(['Gate']) }, t).name).toBe('Duplicate Monitor Name');
  });

  it('per type: Ffmpeg and File need a path, Web Site an http(s) URL, Local a /dev device', () => {
    expect(legacyErrors({ ...ok, path: '' }, none, t).path).toMatch(/Path must be set/);
    expect(legacyErrors({ ...ok, type: 'File', path: '' }, none, t).path).toMatch(/Path must be set/);
    expect(legacyErrors({ ...ok, type: 'WebSite', path: 'example.net' }, none, t).path).toMatch(/http:\/\//);
    expect(legacyErrors({ ...ok, type: 'WebSite', path: 'https://example.net' }, none, t)).toEqual({});
    expect(legacyErrors({ ...ok, type: 'Local', device: 'video0' }, none, t).device).toMatch(/Device/);
  });

  it('passthrough only for Ffmpeg; buffers and section length within legacy’s floors', () => {
    expect(legacyErrors({ ...ok, type: 'Remote', video_writer: 2 }, none, t).video_writer).toMatch(/Passthrough/);
    expect(legacyErrors({ ...ok, video_writer: 2 }, none, t)).toEqual({});
    expect(legacyErrors({ ...ok, image_buffer_count: 1 }, none, t).image_buffer_count).toMatch(/2 or more/);
    expect(legacyErrors({ ...ok, section_length: 5 }, none, t).section_length).toMatch(/10 or more/);
    expect(legacyErrors({ ...ok, pre_event_count: 30, max_image_buffer_count: 20 }, none, t).pre_event_count).toMatch(/Max Image Buffer/);
    // A column the row does not carry is not judged.
    expect(legacyErrors({ type: 'Ffmpeg', name: 'Gate', path: 'x' }, none, t)).toEqual({});
  });

  it('a taken RTSP stream name', () => {
    expect(legacyErrors({ ...ok, rtsp_stream_name: 'gate' }, { ...none, rtspStreamNames: new Set(['gate']) }, t).rtsp_stream_name)
      .toBe('Duplicate RTSP Stream Name');
  });
});

describe('legacyWarnings', () => {
  it('flags an unencoded FFmpeg path and a recording monitor that stores nothing', () => {
    expect(legacyWarnings({ ...ok, path: 'rtsp://cam/live stream' }, t)).toHaveLength(1);
    expect(legacyWarnings({ ...ok, recording: 'Always', save_jpe_gs: 0, video_writer: 0 }, t)).toEqual([
      'SaveJPEGs and VideoWriter are both set to disabled.  Nothing will be recorded!',
    ]);
    expect(legacyWarnings({ ...ok, recording: 'None', save_jpe_gs: 0, video_writer: 0 }, t)).toEqual([]);
  });
});

describe('splitPathCredentials (change_Path)', () => {
  it('moves user:pass out of the URL', () => {
    expect(splitPathCredentials('rtsp://admin:se%23cret@10.0.0.9:554/live')).toEqual({
      path: 'rtsp://10.0.0.9:554/live', user: 'admin', pass: 'se#cret',
    });
  });

  it('leaves URLs without both parts alone', () => {
    expect(splitPathCredentials('rtsp://10.0.0.9/live')).toBeNull();
    expect(splitPathCredentials('rtsp://admin@10.0.0.9/live')).toBeNull();
    expect(splitPathCredentials('rtsp://:pw@10.0.0.9/live')).toBeNull();
    expect(splitPathCredentials('/var/lib/zm/sample.mp4')).toBeNull();
  });
});
