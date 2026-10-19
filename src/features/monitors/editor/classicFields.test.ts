import { describe, expect, it } from 'vitest';
import { CLASSIC_TABS, encoderFitsCodec, estimatedRamUse } from './classicFields';
import { visibleFields, visibleTabs, type FieldValue } from './fields';

const allow = () => true;
const labelsOf = (tabId: string, draft: Record<string, FieldValue>, stored: Record<string, FieldValue> = draft) => {
  const tab = CLASSIC_TABS.find((t) => t.id === tabId)!;
  return visibleFields(tab, draft, stored).map((f) => f.label);
};

/**
 * Labels per tab as `monitor.php` renders them for an Ffmpeg camera
 * (captured `monitor_mid_2.html` from the 1.39.41 box), group headings
 * included. Encoder Template is missing because it shows only when the
 * encoder has templates (none are loaded here), Stream source because
 * neither Go2RTC nor RTSP2Web is on.
 */
const LEGACY_FFMPEG: Record<string, string[]> = {
  general: ['Name', 'Notes', 'Device Class', 'Manufacturer', 'Model', 'Server', 'Source Type', 'Groups', 'Triggers'],
  source: [
    'Capturing', 'Source Path', 'Username', 'Password', 'Method', 'Options', 'Decoding', 'Source Second Path',
    'Decoder', 'Decoder HW Accel Name', 'Decoder HW Accel Device', 'Target colorspace', 'Capture Resolution (pixels)',
    'Orientation', 'Deinterlacing', 'Maximum FPS', 'Alarm Maximum FPS',
  ],
  analysis: [
    'Motion detection', 'Motion Detection', 'Analysis Image', 'Analysis FPS', 'Reference Image Blend %ge',
    'Alarm Reference Image Blend %ge', 'Audio detection', 'Audio Detection', 'Audio Threshold', 'Current Level',
    'Audio Alarm Score',
    'Other', 'Linked Monitors', 'Use Amcrest API',
  ],
  recording: [
    'Recording', 'Storage Area', 'Save JPEGs', 'Video Writer', 'Optional Encoder Parameters',
    'Encoder HW Accel Name', 'Encoder HW Accel Device', 'Output Container', 'Use Wallclock Timestamps',
    'Record Audio', 'Event Start Command', 'Event End Command',
  ],
  viewing: [
    'Show', 'RTSPServer', 'RTSP Stream Name', 'Go2RTC Live Stream', 'RTSP2Web Live Stream', 'Janus Live Stream',
    'Use RTSP Restream', 'Default Player', 'Default Rate', 'Default Scale', 'Default Method For Event View',
  ],
  onvif: [
    'ONVIF URL', 'ONVIF Events Path', 'Username', 'Password', 'ONVIF Options', 'ONVIF Alarm Text',
    'SOAP WSA Compliance', 'ONVIF Event Listener',
  ],
  timestamp: ['Timestamp Label Format', 'Timestamp Label X', 'Timestamp Label Y', 'Font Size'],
  buffers: [
    'Image Buffer Size (frames)', 'Maximum Image Buffer Size (frames)', 'Warmup Frames', 'Pre Event Image Count',
    'Post Event Image Count', 'Stream Replay Image Buffer', 'Alarm Frame Count', 'Estimated Ram Use',
  ],
  control: [
    'Controllable', 'Control Type', 'Control Device', 'Control Address', 'Do motion detection during PTZ motion',
    'Auto Stop Timeout', 'Track Motion', 'Track Delay', 'Return Location', 'Return Delay',
  ],
  misc: [
    'Event Prefix', 'Section length', 'Minimum section length', 'Event Close Mode', 'Motion Frame Skip',
    'Analysis Update Delay', 'FPS Report Interval', 'Signal Check Points', 'Signal Check Colour', 'Web Colour',
    'Embed EXIF data into image', 'Importance', 'Startup Delay',
  ],
  mqtt: ['MQTT Enabled', 'MQTT Subscriptions'],
};

// Monitor 2 on the box: Ffmpeg, no second path, VideoWriter passthrough, Janus off.
const ffmpeg: Record<string, FieldValue> = { type: 'Ffmpeg', device_class: 'Camera', video_writer: 2, janus_enabled: 0, deleted: 0 };

describe('classic catalogue follows monitor.php', () => {
  it('has the legacy tabs in the legacy order', () => {
    expect(visibleTabs(CLASSIC_TABS, ffmpeg, allow).map((t) => t.label)).toEqual([
      'General', 'Source', 'Analysis', 'Recording', 'Viewing', 'ONVIF', 'Timestamp', 'Buffers', 'Control', 'Actions', 'Misc', 'Zones', 'MQTT',
    ]);
  });

  for (const [tab, labels] of Object.entries(LEGACY_FFMPEG)) {
    it(`${tab}: the rendered labels, in order`, () => {
      expect(labelsOf(tab, ffmpeg)).toEqual(labels);
    });
  }

  it('Web Site gets General and Source only; Source is URL, size and refresh', () => {
    const site = { ...ffmpeg, type: 'WebSite' };
    expect(visibleTabs(CLASSIC_TABS, site, allow).map((t) => t.id)).toEqual(['general', 'source']);
    expect(labelsOf('source', site)).toEqual([
      'Capturing', 'Website URL', 'Width (pixels)', 'Height (pixels)', 'Web Site Refresh (Optional)', 'Decoding',
      'Maximum FPS', 'Alarm Maximum FPS',
    ]);
  });

  it('a Speaker loses Timestamp and Zones, and the picture-only analysis rows', () => {
    const speaker = { ...ffmpeg, device_class: 'Speaker' };
    const ids = visibleTabs(CLASSIC_TABS, speaker, allow).map((t) => t.id);
    expect(ids).not.toContain('timestamp');
    expect(ids).not.toContain('zones');
    expect(labelsOf('analysis', speaker)).not.toContain('Analysis Image');
    expect(labelsOf('analysis', speaker)).not.toContain('Reference Image Blend %ge');
  });

  it('Control needs the Control view permission', () => {
    const noControl = (f: string) => f !== 'control';
    expect(visibleTabs(CLASSIC_TABS, ffmpeg, noControl).map((t) => t.id)).not.toContain('control');
  });

  it('per-type Source rows: Local, Remote, VNC, File', () => {
    expect(labelsOf('source', { ...ffmpeg, type: 'Local' })).toEqual([
      'Capturing', 'Device Path', 'Device Channel', 'Device Format', 'Capture Palette', 'Multi Buffering',
      'Captures Per Frame', 'Decoding', 'Target colorspace', 'Capture Resolution (pixels)', 'Orientation',
      'Deinterlacing', 'Maximum FPS', 'Alarm Maximum FPS',
    ]);
    expect(labelsOf('source', { ...ffmpeg, type: 'Remote', protocol: 'http' }).slice(0, 8)).toEqual([
      'Capturing', 'Username', 'Password', 'Protocol', 'Method', 'Host Name', 'Port', 'Path',
    ]);
    expect(labelsOf('source', { ...ffmpeg, type: 'VNC' }).slice(0, 5)).toEqual(['Capturing', 'Host Name', 'Port', 'Username', 'Password']);
    expect(labelsOf('source', { ...ffmpeg, type: 'File' }).slice(0, 3)).toEqual(['Capturing', 'Source Path', 'Decoding']);
  });

  it('the secondary sources appear once a second path exists', () => {
    const two = { ...ffmpeg, second_path: 'rtsp://cam/sub' };
    expect(labelsOf('analysis', two)).toContain('Analysis Source');
    expect(labelsOf('recording', two)).toContain('Recording Source');
  });

  it('Output Codec and Encoder only for Encode; the Janus extras only with Janus on', () => {
    expect(labelsOf('recording', { ...ffmpeg, video_writer: 1 })).toEqual(expect.arrayContaining(['Output Codec', 'Encoder']));
    expect(labelsOf('viewing', { ...ffmpeg, janus_enabled: 1 })).toEqual(expect.arrayContaining([
      'Janus Live Stream Audio', 'Janus Profile-ID Override', 'Janus RTSP Session Timeout Override',
    ]));
    expect(labelsOf('viewing', { ...ffmpeg, restream: 1 })).toContain('User for RTSP Server Auth');
  });

  it('Undelete shows on a monitor stored as deleted, and stays while it is being undeleted', () => {
    expect(labelsOf('general', ffmpeg)).not.toContain('Monitor is Deleted, Undelete?');
    expect(labelsOf('general', { ...ffmpeg, deleted: 0 }, { ...ffmpeg, deleted: 1 })[0]).toBe('Monitor is Deleted, Undelete?');
  });
});

describe('encoderFitsCodec (monitor.js OutputCodec onchange)', () => {
  it('keeps only the encoders that produce the chosen codec', () => {
    expect(encoderFitsCodec('libx264', 27)).toBe(true);
    expect(encoderFitsCodec('hevc_vaapi', 27)).toBe(false);
    expect(encoderFitsCodec('libx265', 173)).toBe(true);
    expect(encoderFitsCodec('libvpx-vp9', 167)).toBe(true);
    expect(encoderFitsCodec('av1_nvenc', 226)).toBe(true);
    expect(encoderFitsCodec('libx264', 226)).toBe(false);
    expect(encoderFitsCodec('auto', 27)).toBe(true);
    expect(encoderFitsCodec('libx264', 0)).toBe(true);
  });
});

describe('estimatedRamUse (monitor.js update_estimated_ram_use)', () => {
  it('is (buffers + pre-event) frames, plus the packet queue when it has a limit', () => {
    const base = { width: 1920, height: 1080, colours: 4, image_buffer_count: 3, pre_event_count: 5 };
    expect(estimatedRamUse({ ...base, max_image_buffer_count: 0 })).toEqual({ min: '63.28MB', max: null });
    expect(estimatedRamUse({ ...base, max_image_buffer_count: 121 })).toEqual({ min: '63.28MB', max: '1GB' });
    expect(estimatedRamUse({ ...base, width: null })).toBeNull();
  });
});
