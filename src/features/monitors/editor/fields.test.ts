import { describe, expect, it } from 'vitest';
import {
  TABS, buildTabs, isFieldVisible, visibleFields, validateDraft, fieldErrorsFromDetails, tabForField,
  RESOLUTION_PRESETS, type FieldValue,
} from './fields';

const source = TABS.find((t) => t.id === 'source')!;
const labels = (draft: Record<string, FieldValue>) =>
  visibleFields(source, draft).filter((f) => f.kind !== 'group').map((f) => f.key);

describe('Source tab visibility follows the legacy per-type form', () => {
  it('FFmpeg: path, method, options, decoder + hwaccel; no V4L or Remote fields', () => {
    const keys = labels({ type: 'Ffmpeg' });
    expect(keys).toEqual(expect.arrayContaining(['path', 'method', 'options', 'second_path', 'decoder', 'decoder_hw_accel_name', 'decoder_hw_accel_device', 'user', 'pass', 'colours', 'width', 'orientation', 'deinterlacing', 'brightness']));
    expect(keys).not.toContain('device');
    expect(keys).not.toContain('protocol');
    expect(keys).not.toContain('rtsp_describe');
  });

  it('Local: V4L fields and the V4L2 deinterlace list', () => {
    const keys = labels({ type: 'Local' });
    expect(keys).toEqual(expect.arrayContaining(['device', 'channel', 'format', 'palette', 'v4l_multi_buffer', 'v4l_captures_per_frame', 'deinterlacing']));
    expect(keys).not.toContain('decoder');
    const deint = visibleFields(source, { type: 'Local' }).find((f) => f.key === 'deinterlacing')!;
    expect(deint.options!.length).toBe(13);
  });

  it('Remote: method list depends on protocol; RTSP describe only for rtsp', () => {
    const http = visibleFields(source, { type: 'Remote', protocol: 'http' });
    expect(http.find((f) => f.key === 'method')!.options!.map((o) => o.value)).toEqual(['simple', 'regexp', 'jpegTags']);
    expect(http.some((f) => f.key === 'rtsp_describe')).toBe(false);
    const rtsp = visibleFields(source, { type: 'Remote', protocol: 'rtsp' });
    expect(rtsp.find((f) => f.key === 'method')!.options!.map((o) => o.value)).toEqual(['rtpUni', 'rtpMulti', 'rtpRtsp', 'rtpRtspHttp']);
    expect(rtsp.some((f) => f.key === 'rtsp_describe')).toBe(true);
    // Exactly one `method` field is visible at a time.
    expect(http.filter((f) => f.key === 'method')).toHaveLength(1);
    expect(rtsp.filter((f) => f.key === 'method')).toHaveLength(1);
  });

  it('WebSite: URL, plain width/height and no image adjustments; the adjustments group heading goes too', () => {
    const fields = visibleFields(source, { type: 'WebSite' });
    const keys = fields.filter((f) => f.kind !== 'group').map((f) => f.key);
    expect(keys).toContain('path');
    expect(keys).toContain('width');
    expect(keys).toContain('height');
    expect(keys).not.toContain('brightness');
    expect(keys).not.toContain('orientation');
    expect(fields.some((f) => f.kind === 'group' && f.key === '_adjust')).toBe(false);
    expect(fields.find((f) => f.key === 'width')!.kind).toBe('number');
  });

  it('Vnc: host, port, user, pass; Curl: URL + auth; File: path only', () => {
    expect(labels({ type: 'Vnc' })).toEqual(expect.arrayContaining(['host', 'port', 'user', 'pass']));
    expect(labels({ type: 'Vnc' })).not.toContain('path');
    expect(labels({ type: 'Curl' })).toEqual(expect.arrayContaining(['path', 'user', 'pass']));
    expect(labels({ type: 'File' })).toContain('path');
    expect(labels({ type: 'File' })).not.toContain('user');
  });

  it('fields without `show` are always visible', () => {
    expect(isFieldVisible({ kind: 'text', key: 'name', label: 'Name' }, { type: 'Local' })).toBe(true);
  });
});

describe('validateDraft', () => {
  const base: Record<string, FieldValue> = { type: 'Ffmpeg', name: 'Cam', width: 1920, height: 1080 };

  it('is clean for a sane draft', () => {
    expect(validateDraft(TABS, base)).toEqual({});
  });

  it('requires a name', () => {
    expect(validateDraft(TABS, { ...base, name: '  ' })).toEqual({ name: 'Required.' });
  });

  it('rejects width/height under 1 and non-integers', () => {
    expect(validateDraft(TABS, { ...base, width: 0 }).width).toMatch(/whole numbers of at least 1/);
    expect(validateDraft(TABS, { ...base, height: 0 }).width).toMatch(/whole numbers of at least 1/);
    expect(validateDraft(TABS, { ...base, width: 1.5 }).width).toMatch(/whole numbers of at least 1/);
    // WebSite uses the plain number fields, so the message is the generic one.
    expect(validateDraft(TABS, { ...base, type: 'WebSite', height: 0 }).height).toBe('Must be at least 1.');
  });

  it('applies numeric minimums and the -1 image-adjustment floor', () => {
    expect(validateDraft(TABS, { ...base, brightness: -1 })).toEqual({});
    expect(validateDraft(TABS, { ...base, brightness: -2 }).brightness).toBe('Must be at least -1.');
    expect(validateDraft(TABS, { ...base, image_buffer_count: 0 }).image_buffer_count).toBe('Must be at least 1.');
    expect(validateDraft(TABS, { ...base, ref_blend_perc: 101 }).ref_blend_perc).toBe('Must be at most 100.');
    expect(validateDraft(TABS, { ...base, label_x: 1.5 }).label_x).toBe('Must be a whole number.');
  });

  it('checks the port pattern only where the port is shown', () => {
    expect(validateDraft(TABS, { ...base, type: 'Remote', port: 'abc' }).port).toMatch(/between 0 and 65535/);
    expect(validateDraft(TABS, { ...base, type: 'Remote', port: '8080' })).toEqual({});
    // FFmpeg hides the port, so garbage there is ignored.
    expect(validateDraft(TABS, { ...base, port: 'abc' })).toEqual({});
  });

  it('checks the V4L device path pattern', () => {
    expect(validateDraft(TABS, { ...base, type: 'Local', device: 'video0' }).device).toMatch(/\/dev path/);
    expect(validateDraft(TABS, { ...base, type: 'Local', device: '/dev/video0' })).toEqual({});
  });

  it('translates messages through the given t', () => {
    const t = (k: string) => `X:${k}`;
    expect(validateDraft(TABS, { ...base, name: '' }, t)).toEqual({ name: 'X:Required.' });
  });
});

describe('fieldErrorsFromDetails', () => {
  it('maps zm-api [[field, message]] pairs', () => {
    expect(fieldErrorsFromDetails([['name', 'taken'], ['width', 'lower than 1']])).toEqual({ name: 'taken', width: 'lower than 1' });
  });
  it('maps {field, message} objects and {field: message} records', () => {
    expect(fieldErrorsFromDetails([{ field: 'name', message: 'taken' }])).toEqual({ name: 'taken' });
    expect(fieldErrorsFromDetails([{ name: 'taken' }])).toEqual({ name: 'taken' });
  });
  it('returns nothing for undefined or garbage', () => {
    expect(fieldErrorsFromDetails(undefined)).toEqual({});
    expect(fieldErrorsFromDetails('nope')).toEqual({});
    expect(fieldErrorsFromDetails([42])).toEqual({});
  });
});

describe('catalogue shape', () => {
  it('tabForField finds the tab a key lives on', () => {
    expect(tabForField(TABS, 'name')).toBe('general');
    expect(tabForField(TABS, 'decoder')).toBe('source');
    expect(tabForField(TABS, 'storage_id')).toBe('recording');
    expect(tabForField(TABS, 'nope')).toBeUndefined();
  });

  it('label sizes are the legacy 1–4 (2 = Default)', () => {
    const f = TABS.flatMap((t) => t.fields).find((f) => f.key === 'label_size')!;
    expect(f.options!.map((o) => o.value)).toEqual([1, 2, 3, 4]);
    expect(f.options![1].label).toBe('Default');
  });

  it('the resolution preset list is the legacy one', () => {
    expect(RESOLUTION_PRESETS[0]).toEqual({ width: 176, height: 120, label: '176x120 QCIF' });
    expect(RESOLUTION_PRESETS.at(-1)).toEqual({ width: 3840, height: 2160, label: '3840x2160 4K UHD' });
  });

  it('every user-visible label goes through t', () => {
    const seen: string[] = [];
    buildTabs((k) => { seen.push(k); return k; });
    expect(seen).toContain('Target colourspace');
    expect(seen).toContain('Camera passthrough');
    expect(seen).toContain('Default rate');
    // Wire values never pass through t.
    expect(seen).not.toContain('rtpRtsp');
    expect(seen).not.toContain('h264_vaapi');
  });
});
