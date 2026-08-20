/**
 * Catalog of editable monitor fields, grouped into tabs that mirror the
 * legacy ZM monitor-edit sidebar. Each entry says how to render the field
 * (text / number / select / toggle / textarea / colour / lookup selects),
 * what its label and optional help-text are, for selects the options, when
 * it is shown (`show` — the legacy form swaps its Source widgets on
 * `type`/`protocol`), and its validation bounds.
 *
 * Field names match the backend Monitor schema so we can both populate from
 * the read response and PATCH only the changed keys. `contract.test.ts`
 * checks every key and every select option against the OpenAPI snapshot.
 *
 * Labels, help text and option labels are user-visible, so the tables are
 * built by `buildTabs(t)` with literal `t('…')` calls (the i18n extractor
 * needs literal keys). Components use `useMonitorTabs()`; option `value`s
 * are wire values and never translated.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'toggle'
  | 'password'
  /** `<input type=color>` with a swatch; legacy Web Colour / Signal Check Colour. */
  | 'color'
  /** Width × height pair with the legacy resolution preset list and an aspect lock. Bound to `width`; also writes `height`. */
  | 'resolution'
  /** Dropdown sourced live from /api/v3/controls (PTZ-driver catalogue). */
  | 'control-select'
  /** Dropdown sourced from /api/v3/storage. */
  | 'storage-select'
  /** Dropdown sourced from /api/v3/servers (null = any / single-server install). */
  | 'server-select'
  /** Dropdown sourced from /api/v3/manufacturers with an "enter new" row. */
  | 'manufacturer-select'
  /** Dropdown sourced from /api/v3/models, filtered by the draft's manufacturer, with an "enter new" row. */
  | 'model-select'
  /** None / Home / saved presets from /api/v3/control_presets. */
  | 'return-location-select'
  /** Multi-select of the other monitors, stored as a comma-separated id list. */
  | 'linked-monitors'
  | 'group';

export type FieldValue = string | number | null;

/**
 * When a field is shown. The legacy form renders a different Source tab per
 * `type` (and per `protocol` for Remote); fields with no `show` are always
 * visible. Hidden fields are neither rendered nor validated, but their values
 * stay in the draft so switching type back and forth loses nothing.
 */
export interface FieldVisibility {
  types?: string[];
  notTypes?: string[];
  protocols?: string[];
}

export interface FieldDef {
  kind: FieldKind;
  key: string;
  label: string;
  help?: string;
  /** For 'select'. */
  options?: Array<{ value: string | number; label: string }>;
  /** For nullable 'select's: label of an extra first option that writes `null`. */
  nullOption?: string;
  /** Optional width hint inside the 2-col grid. Default: 1 col. */
  span?: 1 | 2;
  /** Optional placeholder for text-type inputs. */
  placeholder?: string;
  show?: FieldVisibility;
  required?: boolean;
  min?: number;
  max?: number;
  /** Numbers must be whole. */
  integer?: boolean;
  /** Text must match; `patternHelp` is the error shown when it does not. */
  pattern?: RegExp;
  patternHelp?: string;
  /** A link rendered beside the label (legacy "LIST" button next to Control type). */
  link?: { to: string; label: string };
}

export interface TabDef {
  id: string;
  label: string;
  description?: string;
  fields: FieldDef[];
}

/** Minimal shape of `t` the builder needs — keeps this module usable without React. */
export type Translate = (key: string) => string;

/* ------------------------------------------------------------------------ */
/*  Option lists shared with the Add dialog                                 */
/* ------------------------------------------------------------------------ */

export const MONITOR_TYPE_VALUES = ['Ffmpeg', 'Libvlc', 'Remote', 'Local', 'File', 'Curl', 'WebSite', 'Vnc'] as const;
export type MonitorTypeValue = (typeof MONITOR_TYPE_VALUES)[number];

/**
 * Legacy resolution preset list (`monitor.php` `$resolutions`). Values are
 * `WxH`; labels add the marketing name where ZoneMinder has one.
 */
export const RESOLUTION_PRESETS: ReadonlyArray<{ width: number; height: number; label: string }> = [
  { width: 176, height: 120, label: '176x120 QCIF' },
  { width: 176, height: 144, label: '176x144' },
  { width: 320, height: 240, label: '320x240' },
  { width: 320, height: 200, label: '320x200' },
  { width: 352, height: 240, label: '352x240 CIF' },
  { width: 352, height: 480, label: '352x480' },
  { width: 640, height: 360, label: '640x360' },
  { width: 640, height: 400, label: '640x400' },
  { width: 640, height: 480, label: '640x480' },
  { width: 704, height: 240, label: '704x240 2CIF' },
  { width: 704, height: 480, label: '704x480 4CIF' },
  { width: 704, height: 576, label: '704x576 D1 PAL' },
  { width: 720, height: 480, label: '720x480 Full D1 NTSC' },
  { width: 720, height: 576, label: '720x576 Full D1 PAL' },
  { width: 1280, height: 720, label: '1280x720 720p' },
  { width: 1280, height: 800, label: '1280x800' },
  { width: 1280, height: 960, label: '1280x960 960p' },
  { width: 1280, height: 1024, label: '1280x1024 1MP' },
  { width: 1600, height: 1200, label: '1600x1200 2MP' },
  { width: 1920, height: 1080, label: '1920x1080 1080p' },
  { width: 2048, height: 1536, label: '2048x1536 3MP' },
  { width: 2560, height: 1440, label: '2560x1440 1440p QHD' },
  { width: 2560, height: 1920, label: '2560x1920 5MP' },
  { width: 2688, height: 1520, label: '2688x1520 4MP' },
  { width: 2960, height: 1668, label: '2960x1668 5MP' },
  { width: 3072, height: 2048, label: '3072x2048 6MP' },
  { width: 3840, height: 2160, label: '3840x2160 4K UHD' },
];

/** FFmpeg decoder names the legacy form offers (`monitor.php` `$decoders`). */
const DECODER_NAMES = [
  'libx264', 'h264', 'h264_cuvid', 'h264_nvmpi', 'h264_mmal', 'h264_omx', 'h264_qsv', 'h264_vaapi', 'h264_v4l2m2m',
  'libx265', 'hevc', 'hevc_cuvid', 'hevc_nvmpi', 'hevc_qsv', 'hevc_vaapi',
  'vp8_nvmpi', 'libvpx-vp9', 'vp9_qsv', 'vp9_cuvid', 'vp9_nvmpi', 'vp9_v4l2m2m',
  'libsvtav1', 'libaom-av1', 'libdav1d', 'av1', 'av1_qsv', 'av1_cuvid',
];

/** FFmpeg encoder names the legacy form offers (`monitor.php` `$videowriter_encoders`). */
const ENCODER_NAMES = [
  'libx264', 'h264', 'h264_nvenc', 'h264_omx', 'h264_qsv', 'h264_vaapi', 'h264_v4l2m2m',
  'libx265', 'hevc_nvenc', 'hevc_qsv', 'hevc_vaapi',
  'libvpx-vp9', 'vp9-qsv', 'libsvtav1', 'libaom-av1', 'av1_qsv', 'av1_vaapi', 'av1_nvenc',
];

/* ------------------------------------------------------------------------ */
/*  Tabs                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Build the full tab/field catalogue with every label resolved through `t`.
 * Placeholders that are format examples (URLs, strftime patterns, tokens)
 * stay literal — they are values, not prose.
 */
export function buildTabs(t: Translate): TabDef[] {
  const RUN_MODE_CAPTURING = [
    { value: 'None',     label: t('None') },
    { value: 'Ondemand', label: t('On demand') },
    { value: 'Always',   label: t('Always') },
  ];

  const RUN_MODE_ANALYSING = [
    { value: 'None',   label: t('None') },
    { value: 'Always', label: t('Always') },
  ];

  const RUN_MODE_RECORDING = [
    { value: 'None',     label: t('None') },
    { value: 'OnMotion', label: t('On motion') },
    { value: 'Always',   label: t('Always') },
  ];

  const FUNCTION_OPTIONS = [
    { value: 'None',    label: t('None') },
    { value: 'Monitor', label: t('Monitor — live view, no recording') },
    { value: 'Modect',  label: t('Modect — record on motion') },
    { value: 'Record',  label: t('Record — continuous') },
    { value: 'Mocord',  label: t('Mocord — continuous + motion-tag') },
    { value: 'Nodect',  label: t('Nodect — no motion, no record') },
  ];

  const MONITOR_TYPE_OPTIONS = [
    { value: 'Ffmpeg',  label: t('FFmpeg') },
    { value: 'Libvlc',  label: t('libVLC') },
    { value: 'Remote',  label: t('Remote (HTTP MJPEG)') },
    { value: 'Local',   label: t('Local device (V4L)') },
    { value: 'File',    label: t('File (loop)') },
    { value: 'Curl',    label: t('cURL') },
    { value: 'WebSite', label: t('Website') },
    { value: 'Vnc',     label: t('VNC') },
  ];

  const DECODING_OPTIONS = [
    { value: 'None',                label: t('None') },
    { value: 'Ondemand',            label: t('On demand') },
    { value: 'KeyFrames',           label: t('Key frames only') },
    { value: 'KeyFramesOndemand',   label: t('Key frames + on demand') },
    { value: 'Always',              label: t('Always') },
  ];

  const ORIENTATION_OPTIONS = [
    { value: 'Rotate0',   label: t('Default (0°)') },
    { value: 'Rotate90',  label: t('Rotate right (90°)') },
    { value: 'Rotate180', label: t('Rotate 180°') },
    { value: 'Rotate270', label: t('Rotate left (270°)') },
    { value: 'FlipHori',  label: t('Flip horizontally') },
    { value: 'FlipVert',  label: t('Flip vertically') },
  ];

  const OUTPUT_CONTAINER_OPTIONS = [
    { value: 'Auto', label: t('Auto') },
    { value: 'Mp4',  label: t('MP4') },
    { value: 'Mkv',  label: t('MKV') },
    { value: 'Webm', label: t('WebM') },
  ];

  const ANALYSIS_SOURCE_OPTIONS = [
    { value: 'Primary',   label: t('Primary stream') },
    { value: 'Secondary', label: t('Secondary stream') },
  ];

  const RECORDING_SOURCE_OPTIONS = [
    { value: 'Primary',   label: t('Primary') },
    { value: 'Secondary', label: t('Secondary') },
    { value: 'Both',      label: t('Both') },
  ];

  const ANALYSIS_IMAGE_OPTIONS = [
    { value: 'FullColour', label: t('Full colour') },
    { value: 'YChannel',   label: t('Y channel (luma only)') },
  ];

  const EVENT_CLOSE_MODE_OPTIONS = [
    { value: 'Idle',     label: t('Idle (default)') },
    { value: 'Time',     label: t('Time-based') },
    { value: 'Duration', label: t('Fixed duration') },
    { value: 'Alarm',    label: t('On alarm end') },
    { value: 'System',   label: t('System') },
  ];

  const IMPORTANCE_OPTIONS = [
    { value: 'Normal', label: t('Normal') },
    { value: 'Less',   label: t('Less') },
    { value: 'Not',    label: t('Not important') },
  ];

  /**
   * Legacy ZM label-size enum (`monitor.php` `$label_size`): 1–4, stored as
   * a small int. New monitors default to 2 ("Default").
   */
  const LABEL_SIZE_OPTIONS = [
    { value: 1, label: t('Small') },
    { value: 2, label: t('Default') },
    { value: 3, label: t('Large') },
    { value: 4, label: t('Extra Large') },
  ];

  /** RTSP transport for FFmpeg/libVLC sources (`$rtspFFMpegMethods`). */
  const FFMPEG_METHOD_OPTIONS = [
    { value: 'rtpRtsp',     label: t('TCP') },
    { value: 'rtpUni',      label: t('UDP') },
    { value: 'rtpMulti',    label: t('UDP multicast') },
    { value: 'rtpRtspHttp', label: t('HTTP tunnel') },
  ];

  /** Remote + RTSP protocol (`$rtspMethods`). */
  const RTSP_METHOD_OPTIONS = [
    { value: 'rtpUni',      label: t('RTP/Unicast') },
    { value: 'rtpMulti',    label: t('RTP/Multicast') },
    { value: 'rtpRtsp',     label: t('RTP/RTSP') },
    { value: 'rtpRtspHttp', label: t('RTP/RTSP/HTTP') },
  ];

  /** Remote + HTTP protocol (`$httpMethods`). */
  const HTTP_METHOD_OPTIONS = [
    { value: 'simple',   label: t('Simple') },
    { value: 'regexp',   label: t('Regexp') },
    { value: 'jpegTags', label: t('JPEG tags') },
  ];

  const REMOTE_PROTOCOL_OPTIONS = [
    { value: 'http', label: t('HTTP') },
    { value: 'rtsp', label: t('RTSP') },
  ];

  /** `SaveJPEGs` is a 0–3 bitmask: bit 0 = capture frames, bit 1 = analysis frames. */
  const SAVE_JPEGS_OPTIONS = [
    { value: 0, label: t('Disabled') },
    { value: 1, label: t('Frames only') },
    { value: 2, label: t('Analysis images only (if available)') },
    { value: 3, label: t('Frames + Analysis images') },
  ];

  /** `VideoWriter`: 0 disabled, 1 re-encode, 2 camera passthrough (FFmpeg sources only). */
  const VIDEO_WRITER_OPTIONS = [
    { value: 0, label: t('Disabled') },
    { value: 1, label: t('Encode') },
    { value: 2, label: t('Camera passthrough') },
  ];

  /** `OutputCodec` is an FFmpeg `AVCodecID`; 0 lets ZoneMinder pick. */
  const OUTPUT_CODEC_OPTIONS = [
    { value: 0,   label: t('Auto') },
    { value: 27,  label: 'h264' },
    { value: 173, label: 'h265/hevc' },
    { value: 167, label: 'vp9' },
    { value: 226, label: 'av1' },
  ];

  const DECODER_OPTIONS = [
    { value: 'auto', label: t('Auto') },
    ...DECODER_NAMES.map((name) => ({ value: name, label: name })),
  ];

  const ENCODER_OPTIONS = [
    { value: 'auto', label: t('Auto') },
    ...ENCODER_NAMES.map((name) => ({ value: name, label: name })),
  ];

  /** Target colourspace (`$Colours`): bytes per pixel. */
  const COLOURS_OPTIONS = [
    { value: 1, label: t('8-bit greyscale') },
    { value: 3, label: t('24-bit colour') },
    { value: 4, label: t('32-bit colour') },
  ];

  /** `Deinterlacing` bit-packed constants (`$deinterlaceopts`). */
  const DEINTERLACE_OPTIONS = [
    { value: 0x00000000, label: t('Disabled') },
    { value: 0x00001E04, label: t('Four field motion adaptive — soft') },
    { value: 0x00001404, label: t('Four field motion adaptive — medium') },
    { value: 0x00000A04, label: t('Four field motion adaptive — hard') },
    { value: 0x00000001, label: t('Discard') },
    { value: 0x00000002, label: t('Linear') },
    { value: 0x00000003, label: t('Blend') },
    { value: 0x00000205, label: t('Blend (25%)') },
  ];

  /** Local (V4L2) sources add the driver-side field modes (`$deinterlaceopts_v4l2`). */
  const DEINTERLACE_V4L2_OPTIONS = [
    ...DEINTERLACE_OPTIONS,
    { value: 0x02000000, label: t('V4L2: capture top field only') },
    { value: 0x03000000, label: t('V4L2: capture bottom field only') },
    { value: 0x07000000, label: t('V4L2: alternate fields (bob)') },
    { value: 0x01000000, label: t('V4L2: progressive') },
    { value: 0x04000000, label: t('V4L2: interlaced') },
  ];

  const V4L_MULTI_BUFFER_OPTIONS = [
    { value: 1, label: t('Yes') },
    { value: 0, label: t('No') },
  ];

  const RTSP2WEB_TYPE_OPTIONS = [
    { value: 'Hls',    label: t('HLS') },
    { value: 'Mse',    label: t('MSE') },
    { value: 'WebRtc', label: t('WebRTC') },
  ];

  const DEFAULT_CODEC_OPTIONS = [
    { value: 'Auto',  label: t('Auto') },
    { value: 'Mp4',   label: t('MP4') },
    { value: 'Mjpeg', label: t('MJPEG') },
  ];

  /**
   * Legacy playback speeds (`config.php` `$rates`), in percent. The legacy
   * list also has reverse speeds (-25 … -1600); the request schema floors
   * `default_rate` at 0, so they are left out.
   */
  const DEFAULT_RATE_OPTIONS = [
    { value: 0,    label: t('Stop') },
    { value: 25,   label: '1/4x' },
    { value: 50,   label: '1/2x' },
    { value: 100,  label: '1x' },
    { value: 200,  label: '2x' },
    { value: 500,  label: '5x' },
    { value: 1000, label: '10x' },
    { value: 1600, label: '16x' },
  ];

  /** Legacy viewer scales (`config.php` `$scales`). Stored as text. */
  const DEFAULT_SCALE_OPTIONS = [
    { value: '0',            label: t('Auto') },
    { value: '100',          label: t('Actual') },
    { value: 'fit_to_width', label: t('Fit to width') },
    { value: '480px',        label: t('Max 480px') },
    { value: '640px',        label: t('Max 640px') },
    { value: '800px',        label: t('Max 800px') },
    { value: '1024px',       label: t('Max 1024px') },
    { value: '1280px',       label: t('Max 1280px') },
    { value: '1600px',       label: t('Max 1600px') },
  ];

  const STREAMING: FieldVisibility = { types: ['Ffmpeg', 'Libvlc'] };
  const REMOTE: FieldVisibility = { types: ['Remote'] };
  const LOCAL: FieldVisibility = { types: ['Local'] };
  const NOT_WEBSITE: FieldVisibility = { notTypes: ['WebSite'] };
  const IMAGE_ADJUST_HELP = t('-1 = camera default.');
  const PORT_PATTERN = /^(|\d{1,5})$/;
  const PORT_HELP = t('Port must be a number between 0 and 65535.');

  return [
    {
      id: 'general',
      label: t('General'),
      description: t('Identity, make and model, and how this monitor relates to the rest of the system.'),
      fields: [
        { kind: 'text',      key: 'name',         label: t('Name'), span: 2, required: true },
        { kind: 'textarea',  key: 'notes',        label: t('Notes'), span: 2,
          help: t('Free-form metadata. ZoneMinder convention: key=value pairs.') },
        { kind: 'select',    key: 'type',         label: t('Source type'), options: MONITOR_TYPE_OPTIONS,
          help: t('Backend used to ingest the camera feed. The Source tab changes with it.') },
        { kind: 'select',    key: 'function',     label: t('Function'),
          options: FUNCTION_OPTIONS,
          help: t('Master switch that controls how the monitor captures, analyses, and records.') },
        { kind: 'select',    key: 'importance',   label: t('Importance'), options: IMPORTANCE_OPTIONS },
        { kind: 'toggle',    key: 'decoding_enabled', label: t('Decoding enabled'),
          help: t('Off skips decoding entirely — no live view, no motion detection; passthrough recording still works.') },
        { kind: 'manufacturer-select', key: 'manufacturer_id', label: t('Manufacturer') },
        { kind: 'model-select',        key: 'model_id',        label: t('Model') },
        { kind: 'server-select',       key: 'server_id',       label: t('Server'),
          help: t('Which server in a multi-server install runs this monitor’s capture daemon.') },
        { kind: 'number',    key: 'refresh',      label: t('Refresh (s)'), min: 0, integer: true,
          help: t('Website monitors: how often the page is reloaded.') },
        { kind: 'linked-monitors', key: 'linked_monitors', label: t('Linked monitors'), span: 2,
          help: t('An alarm on any linked monitor also triggers this one.') },
      ],
    },
    {
      id: 'source',
      label: t('Source'),
      description: t('How the dashboard pulls frames from this camera.'),
      fields: [
        { kind: 'group',     key: '_run',         label: t('Run mode') },
        { kind: 'select',    key: 'capturing',    label: t('Capturing'),  options: RUN_MODE_CAPTURING },
        { kind: 'select',    key: 'decoding',     label: t('Decoding'),   options: DECODING_OPTIONS },

        { kind: 'group',     key: '_endpoint',    label: t('Stream') },

        // Local (V4L2)
        { kind: 'text',      key: 'device',       label: t('Device path'), show: LOCAL, placeholder: '/dev/video0',
          pattern: /^(|\/dev\/[\w/.-]+)$/, patternHelp: t('Device must be a /dev path, e.g. /dev/video0.') },
        { kind: 'number',    key: 'channel',      label: t('Device channel'), show: LOCAL, min: 0, integer: true },
        { kind: 'number',    key: 'format',       label: t('Device format'), show: LOCAL, min: 0, integer: true,
          help: t('V4L2 standard id (e.g. 0 = PAL, 1 = NTSC, 255 = auto).') },
        { kind: 'number',    key: 'palette',      label: t('Capture palette'), show: LOCAL, min: 0, integer: true,
          help: t('V4L2 pixel format as a fourcc number; 0 = auto.') },
        { kind: 'select',    key: 'v4l_multi_buffer', label: t('V4L multi-buffer'), show: LOCAL,
          options: V4L_MULTI_BUFFER_OPTIONS, nullOption: t('Use config value') },
        { kind: 'number',    key: 'v4l_captures_per_frame', label: t('V4L captures per frame'), show: LOCAL, min: 1, integer: true },

        // Remote (HTTP / RTSP) and VNC
        { kind: 'select',    key: 'protocol',     label: t('Protocol'), show: REMOTE, options: REMOTE_PROTOCOL_OPTIONS },
        { kind: 'select',    key: 'method',       label: t('Method'), show: { types: ['Remote'], protocols: ['http', ''] },
          options: HTTP_METHOD_OPTIONS },
        { kind: 'select',    key: 'method',       label: t('Method'), show: { types: ['Remote'], protocols: ['rtsp'] },
          options: RTSP_METHOD_OPTIONS },
        { kind: 'text',      key: 'host',         label: t('Host'), show: { types: ['Remote', 'Vnc'] } },
        { kind: 'text',      key: 'port',         label: t('Port'), show: { types: ['Remote', 'Vnc'] },
          pattern: PORT_PATTERN, patternHelp: PORT_HELP },
        { kind: 'text',      key: 'path',         label: t('Remote host path'), show: REMOTE, span: 2 },
        { kind: 'text',      key: 'sub_path',     label: t('Remote host sub-path'), show: REMOTE, span: 2,
          help: t('Secondary (low-res) path on the same host, used for analysis.') },
        { kind: 'toggle',    key: 'rtsp_describe', label: t('RTSP describe'), show: { types: ['Remote'], protocols: ['rtsp'] },
          help: t('Use the DESCRIBE response’s media URL instead of the configured path.') },

        // FFmpeg / libVLC
        { kind: 'text',      key: 'path',         label: t('Source path'), show: STREAMING, span: 2,
          placeholder: 'rtsp://192.168.1.10:554/Streaming/Channels/101' },
        { kind: 'select',    key: 'method',       label: t('Method'), show: STREAMING, options: FFMPEG_METHOD_OPTIONS,
          help: t('RTSP transport. TCP is the reliable default; UDP has lower latency but drops frames on a busy network.') },
        { kind: 'text',      key: 'options',      label: t('Options'), show: STREAMING, span: 2,
          placeholder: 'rtsp_transport=tcp,stimeout=5000000' },
        { kind: 'text',      key: 'second_path',  label: t('Secondary path'), show: STREAMING, span: 2,
          help: t('Optional low-res stream for analysis while keeping the primary for recording.') },
        { kind: 'select',    key: 'decoder',      label: t('Decoder'), show: STREAMING, options: DECODER_OPTIONS,
          nullOption: t('Default') },
        { kind: 'text',      key: 'decoder_hw_accel_name',   label: t('Decoder hardware acceleration'), show: STREAMING,
          placeholder: 'vaapi', help: t('FFmpeg hwaccel name: vaapi, cuda, qsv, videotoolbox …') },
        { kind: 'text',      key: 'decoder_hw_accel_device', label: t('Decoder hardware device'), show: STREAMING,
          placeholder: '/dev/dri/renderD128' },

        // File / cURL / Website paths
        { kind: 'text',      key: 'path',         label: t('Source path'), show: { types: ['File'] }, span: 2,
          placeholder: '/var/lib/zoneminder/sample.mp4' },
        { kind: 'text',      key: 'path',         label: t('URL'), show: { types: ['Curl'] }, span: 2,
          placeholder: 'http://192.168.1.10/snapshot.jpg' },
        { kind: 'text',      key: 'path',         label: t('Website URL'), show: { types: ['WebSite'] }, span: 2,
          placeholder: 'https://example.net/dashboard' },

        // Credentials (every type that authenticates)
        { kind: 'text',      key: 'user',         label: t('Username'), show: { types: ['Ffmpeg', 'Libvlc', 'Remote', 'Curl', 'Vnc'] } },
        { kind: 'password',  key: 'pass',         label: t('Password'), show: { types: ['Ffmpeg', 'Libvlc', 'Remote', 'Curl', 'Vnc'] } },

        { kind: 'group',     key: '_image',       label: t('Image') },
        { kind: 'select',    key: 'colours',      label: t('Target colourspace'), show: NOT_WEBSITE, options: COLOURS_OPTIONS },
        { kind: 'resolution', key: 'width',       label: t('Capture resolution (px)'), show: NOT_WEBSITE, span: 2 },
        { kind: 'number',    key: 'width',        label: t('Width (px)'), show: { types: ['WebSite'] }, min: 1, integer: true },
        { kind: 'number',    key: 'height',       label: t('Height (px)'), show: { types: ['WebSite'] }, min: 1, integer: true },
        { kind: 'select',    key: 'orientation',  label: t('Orientation'), show: NOT_WEBSITE, options: ORIENTATION_OPTIONS,
          help: t('Rotates / flips the displayed image. Affects live and recorded frames.') },
        { kind: 'select',    key: 'deinterlacing', label: t('Deinterlacing'), show: LOCAL, options: DEINTERLACE_V4L2_OPTIONS },
        { kind: 'select',    key: 'deinterlacing', label: t('Deinterlacing'), show: { notTypes: ['Local', 'WebSite'] },
          options: DEINTERLACE_OPTIONS },
        { kind: 'number',    key: 'max_fps',      label: t('Max FPS'), show: NOT_WEBSITE, min: 0, help: t('0 = unlimited.') },
        { kind: 'number',    key: 'alarm_max_fps',label: t('Alarm max FPS'), show: NOT_WEBSITE, min: 0, help: t('0 = unlimited.') },

        { kind: 'group',     key: '_adjust',      label: t('Image adjustments') },
        { kind: 'number',    key: 'brightness',   label: t('Brightness'), show: NOT_WEBSITE, min: -1, integer: true, help: IMAGE_ADJUST_HELP },
        { kind: 'number',    key: 'contrast',     label: t('Contrast'),   show: NOT_WEBSITE, min: -1, integer: true, help: IMAGE_ADJUST_HELP },
        { kind: 'number',    key: 'hue',          label: t('Hue'),        show: NOT_WEBSITE, min: -1, integer: true, help: IMAGE_ADJUST_HELP },
        { kind: 'number',    key: 'colour',       label: t('Colour'),     show: NOT_WEBSITE, min: -1, integer: true, help: IMAGE_ADJUST_HELP },
      ],
    },
    {
      id: 'analysis',
      label: t('Analysis'),
      description: t('Motion-detection tuning.'),
      fields: [
        { kind: 'select', key: 'analysing',           label: t('Analysing'),           options: RUN_MODE_ANALYSING },
        { kind: 'select', key: 'analysis_source',     label: t('Analysis source'),     options: ANALYSIS_SOURCE_OPTIONS },
        { kind: 'select', key: 'analysis_image',      label: t('Analysis image'),      options: ANALYSIS_IMAGE_OPTIONS },
        { kind: 'number', key: 'analysis_fps_limit',  label: t('Analysis FPS limit'), min: 0,
          help: t('0 = match capture FPS. Lower values reduce CPU at the cost of slower motion detection.') },
        { kind: 'number', key: 'ref_blend_perc',      label: t('Ref image blend %'), min: 0, max: 100, integer: true,
          help: t('How fast the reference frame absorbs new pixels. Higher = adapts faster, misses slower motion.') },
        { kind: 'number', key: 'alarm_ref_blend_perc',label: t('Alarm ref blend %'), min: 0, max: 100, integer: true },
        { kind: 'number', key: 'analysis_update_delay', label: t('Analysis update delay (s)'), min: 0, integer: true },
        { kind: 'toggle', key: 'use_amcrest_api',     label: t('Use Amcrest API'),
          help: t('Poll the Amcrest/Dahua HTTP event API for motion instead of analysing frames.') },
      ],
    },
    {
      id: 'recording',
      label: t('Recording'),
      description: t('When and how events are written to disk.'),
      fields: [
        { kind: 'select', key: 'recording',          label: t('Recording'),         options: RUN_MODE_RECORDING },
        { kind: 'select', key: 'recording_source',   label: t('Recording source'),  options: RECORDING_SOURCE_OPTIONS },
        { kind: 'storage-select', key: 'storage_id', label: t('Storage area') },
        { kind: 'select', key: 'video_writer',       label: t('Video writer'), options: VIDEO_WRITER_OPTIONS,
          help: t('Camera passthrough copies the camera’s H.264/H.265 without re-encoding — FFmpeg sources only.') },
        { kind: 'select', key: 'save_jpe_gs',        label: t('Save JPEGs'), options: SAVE_JPEGS_OPTIONS,
          help: t('Stores per-frame JPEGs in addition to the video — large disk cost; needed for some legacy tooling.') },
        { kind: 'toggle', key: 'record_audio',       label: t('Record audio') },
        { kind: 'select', key: 'output_codec',       label: t('Output codec'), options: OUTPUT_CODEC_OPTIONS },
        { kind: 'select', key: 'encoder',            label: t('Encoder'), options: ENCODER_OPTIONS, nullOption: t('Default') },
        { kind: 'select', key: 'output_container',   label: t('Output container'),  options: OUTPUT_CONTAINER_OPTIONS },
        { kind: 'textarea', key: 'encoder_parameters', label: t('Encoder parameters'), span: 2,
          placeholder: 'crf=23\npreset=veryfast' },
        { kind: 'select', key: 'event_close_mode',   label: t('Event close mode'),  options: EVENT_CLOSE_MODE_OPTIONS },
        { kind: 'text',   key: 'event_prefix',       label: t('Event prefix') },
        { kind: 'number', key: 'section_length',     label: t('Section length (s)'), min: 0, integer: true,
          help: t('Continuous recordings split into events of this length.') },
        { kind: 'toggle', key: 'section_length_warn', label: t('Warn when a section runs long'),
          help: t('Log a warning when an event exceeds the section length.') },
        { kind: 'number', key: 'min_section_length', label: t('Minimum section length (s)'), min: 0, integer: true,
          help: t('Events shorter than this are not closed on schedule.') },
        { kind: 'text',   key: 'event_start_command',label: t('Event start command'), span: 2 },
        { kind: 'text',   key: 'event_end_command',  label: t('Event end command'),   span: 2 },
      ],
    },
    {
      id: 'buffers',
      label: t('Buffers'),
      description: t('Frame buffer sizing — read-most-do-not-touch territory.'),
      fields: [
        { kind: 'number', key: 'image_buffer_count',      label: t('Image buffer size (frames)'), min: 1, integer: true },
        { kind: 'number', key: 'max_image_buffer_count',  label: t('Max image buffer (frames)'), min: 0, integer: true },
        { kind: 'number', key: 'warmup_count',            label: t('Warmup frames'), min: 0, integer: true },
        { kind: 'number', key: 'pre_event_count',         label: t('Pre-event frames'), min: 0, integer: true },
        { kind: 'number', key: 'post_event_count',        label: t('Post-event frames'), min: 0, integer: true },
        { kind: 'number', key: 'stream_replay_buffer',    label: t('Stream replay buffer'), min: 0, integer: true },
        { kind: 'number', key: 'alarm_frame_count',       label: t('Alarm frame count'), min: 1, integer: true },
      ],
    },
    {
      id: 'viewing',
      label: t('Viewing'),
      description: t('Player + streaming-server toggles for the live view.'),
      fields: [
        { kind: 'toggle', key: 'rtsp_server',         label: t('RTSP server') },
        { kind: 'text',   key: 'rtsp_stream_name',    label: t('RTSP stream name') },
        { kind: 'toggle', key: 'janus_enabled',       label: t('Janus WebRTC') },
        { kind: 'toggle', key: 'janus_audio_enabled', label: t('Janus audio') },
        { kind: 'toggle', key: 'restream',            label: t('Janus RTSP restream'),
          help: t('Janus pulls from ZoneMinder’s RTSP server instead of opening a second connection to the camera.') },
        { kind: 'toggle', key: 'rtsp2_web_enabled',   label: t('RTSP-to-Web') },
        { kind: 'select', key: 'rtsp2_web_type',      label: t('RTSP-to-Web type'), options: RTSP2WEB_TYPE_OPTIONS },
        { kind: 'text',   key: 'janus_profile_override', label: t('Janus profile-ID override'),
          placeholder: '42e01f',
          help: t('H.264 profile-level-id Janus advertises. Safari needs a baseline/main profile here when the camera sends something exotic.') },
        { kind: 'number', key: 'janus_rtsp_session_timeout', label: t('Janus RTSP session timeout (s)'), min: 0, integer: true },
        { kind: 'number', key: 'rtsp_user',           label: t('Janus RTSP user id'), min: 0, integer: true,
          help: t('ZoneMinder user id Janus authenticates to the RTSP server as.') },
        { kind: 'select', key: 'default_rate',        label: t('Default rate'), options: DEFAULT_RATE_OPTIONS },
        { kind: 'select', key: 'default_scale',       label: t('Default scale'), options: DEFAULT_SCALE_OPTIONS },
        { kind: 'select', key: 'default_codec',       label: t('Default event view'), options: DEFAULT_CODEC_OPTIONS },
      ],
    },
    {
      id: 'timestamp',
      label: t('Timestamp'),
      description: t('On-image timestamp label format and position.'),
      fields: [
        { kind: 'text',   key: 'label_format',        label: t('Timestamp label format'), span: 2,
          placeholder: '%N - %d/%m/%y %H:%M:%S',
          help: t('strftime-style format. %N = monitor name, %f = hundredths of a second, %Q = "show text" overlay.') },
        { kind: 'number', key: 'label_x',             label: t('Timestamp label X'), min: 0, integer: true,
          help: t('Pixel offset from the left edge of the frame.') },
        { kind: 'number', key: 'label_y',             label: t('Timestamp label Y'), min: 0, integer: true,
          help: t('Pixel offset from the top edge of the frame.') },
        { kind: 'select', key: 'label_size',          label: t('Font size'),
          options: LABEL_SIZE_OPTIONS,
          help: t('Bitmap font baked into the capture daemon. "Default" works for most resolutions.') },
      ],
    },
    {
      id: 'onvif',
      label: t('ONVIF'),
      description: t('ONVIF camera-side endpoint + credentials. Used for events + PTZ on supported devices.'),
      fields: [
        { kind: 'text',     key: 'onvif_url',            label: t('ONVIF URL'), span: 2,
          placeholder: 'http://192.168.0.10/onvif/device_service',
          help: t('Device-service endpoint — usually shown in the camera’s ONVIF status page.') },
        { kind: 'text',     key: 'onvif_username',       label: t('Username') },
        { kind: 'password', key: 'onvif_password',       label: t('Password') },
        { kind: 'text',     key: 'onvif_options',        label: t('ONVIF options'), span: 2,
          help: t('Free-form key=value pairs passed to the ONVIF client (e.g. ProfileToken=Profile_1).') },
        { kind: 'toggle',   key: 'onvif_event_listener', label: t('ONVIF event listener'),
          help: t('Subscribe to the camera’s ONVIF event push (motion / tamper). Polled if disabled.') },
        { kind: 'toggle',   key: 'soap_wsa_compl',       label: t('SOAP WS-Addressing compliance'),
          help: t('Some cameras need WS-Addressing headers on every SOAP call.') },
        { kind: 'text',     key: 'onvif_events_path',    label: t('ONVIF events path'), span: 2,
          placeholder: '/onvif/event_service',
          help: t('Override when the camera’s events service is not at the advertised address.') },
        { kind: 'text',     key: 'onvif_alarm_text',     label: t('ONVIF alarm text'), span: 2,
          placeholder: 'MotionAlarm',
          help: t('Only ONVIF events whose text contains this string raise an alarm. Blank = any event.') },
      ],
    },
    {
      id: 'control',
      label: t('Control'),
      description: t('PTZ driver selection, addressing, and motion-tracking behaviour.'),
      fields: [
        { kind: 'toggle',         key: 'controllable',      label: t('Controllable'), span: 2,
          help: t('Master switch — when off, all PTZ inputs on this monitor are disabled.') },
        { kind: 'control-select', key: 'control_id',        label: t('Control type'), span: 2,
          link: { to: '/settings/ptz-controls', label: t('List') },
          help: t('PTZ driver template from the Controls catalogue (Pelco-D, Hikvision, ONVIF …).') },
        { kind: 'text',           key: 'control_device',    label: t('Control device'),
          placeholder: 'Profile_1',
          help: t('Profile token (ONVIF) or serial device path (e.g. /dev/ttyS0).') },
        { kind: 'text',           key: 'control_address',   label: t('Control address'),
          placeholder: 'user:pass@ip',
          help: t('Override address — leave blank to reuse the monitor source credentials.') },
        { kind: 'number',         key: 'auto_stop_timeout', label: t('Auto stop timeout (s)'), min: 0,
          help: t('Stops a continuous PTZ move after N seconds even if no stop command arrives.') },
        { kind: 'toggle',         key: 'track_motion',      label: t('Track motion'),
          help: t('When ON, the head moves to follow detected motion until the return delay elapses.') },
        { kind: 'number',         key: 'track_delay',       label: t('Track delay (s)'), min: 0, integer: true,
          help: t('Seconds between motion-tracking moves.') },
        { kind: 'return-location-select', key: 'return_location', label: t('Return location'),
          help: t('Where the head returns to once tracking ends: none, the Home preset, or a saved preset.') },
        { kind: 'number',         key: 'return_delay',      label: t('Return delay (s)'), min: 0, integer: true,
          help: t('Idle seconds before the head returns to its return location.') },
        { kind: 'toggle',         key: 'modect_during_ptz', label: t('Detect during PTZ'), span: 2,
          help: t('Run motion detection while the head is moving (usually off — produces false alarms).') },
      ],
    },
    {
      id: 'mqtt',
      label: t('MQTT'),
      description: t('Per-monitor MQTT subscriptions. Broker connection settings live in Settings → Config (MQTT).'),
      fields: [
        { kind: 'toggle', key: 'mqtt_enabled',       label: t('MQTT enabled'), span: 2,
          help: t('When ON, this monitor publishes event topics and listens on the subscriptions below.') },
        { kind: 'text',   key: 'mqtt_subscriptions', label: t('MQTT subscriptions'), span: 2,
          placeholder: 'home/sensors/door, alarms/#',
          help: t('Comma-separated topic patterns this monitor will subscribe to. Supports MQTT wildcards (+, #).') },
      ],
    },
    {
      id: 'misc',
      label: t('Misc'),
      description: t('Branding, signal checks, frame skipping, geolocation, and other low-traffic settings.'),
      fields: [
        { kind: 'color',  key: 'web_colour',          label: t('Web colour'),
          help: t('Colour used in lists / montage to identify this camera.') },
        { kind: 'toggle', key: 'exif',                label: t('Embed EXIF data'),
          help: t('Write capture time and monitor name into saved JPEGs.') },
        { kind: 'number', key: 'signal_check_points', label: t('Signal check points'), min: 0, integer: true,
          help: t('Pixels sampled per frame to detect signal loss. 0 disables the check.') },
        { kind: 'color',  key: 'signal_check_colour', label: t('Signal check colour'),
          help: t('The "no signal" colour the capture card shows when the camera drops.') },
        { kind: 'number', key: 'frame_skip',          label: t('Frame skip'), min: 0, integer: true,
          help: t('Frames to skip between those saved to an event.') },
        { kind: 'number', key: 'motion_frame_skip',   label: t('Motion frame skip'), min: 0, integer: true,
          help: t('Frames to skip between those analysed for motion.') },
        { kind: 'number', key: 'fps_report_interval', label: t('FPS report interval (frames)'), min: 0, integer: true },
        { kind: 'number', key: 'startup_delay',       label: t('Startup delay (s)'), min: 0, integer: true,
          help: t('Wait before the capture daemon starts — lets slow cameras boot.') },
        { kind: 'number', key: 'latitude',            label: t('Latitude'), min: -90, max: 90 },
        { kind: 'number', key: 'longitude',           label: t('Longitude'), min: -180, max: 180 },
      ],
    },
  ];
}

/** Tab catalogue in the active language. Rebuilt only when the language changes. */
export function useMonitorTabs(): TabDef[] {
  const { t } = useTranslation();
  return useMemo(() => buildTabs((key) => t(key)), [t]);
}

/**
 * English-only snapshot, for code that needs the tab/field *structure*
 * outside a component (diffing, key lookups). Anything that renders a
 * label must use `useMonitorTabs()` instead.
 */
export const TABS: TabDef[] = buildTabs((key) => key);

/* ------------------------------------------------------------------------ */
/*  Visibility + validation                                                 */
/* ------------------------------------------------------------------------ */

/** Whether a field is shown for the draft's current `type` / `protocol`. */
export function isFieldVisible(f: FieldDef, draft: Record<string, FieldValue>): boolean {
  const s = f.show;
  if (!s) return true;
  const type = String(draft.type ?? '');
  if (s.types && !s.types.includes(type)) return false;
  if (s.notTypes && s.notTypes.includes(type)) return false;
  if (s.protocols && !s.protocols.includes(String(draft.protocol ?? ''))) return false;
  return true;
}

/** Only the fields of `tab` that apply to the draft (groups whose every field is hidden are dropped too). */
export function visibleFields(tab: TabDef, draft: Record<string, FieldValue>): FieldDef[] {
  const out: FieldDef[] = [];
  for (let i = 0; i < tab.fields.length; i++) {
    const f = tab.fields[i];
    if (f.kind === 'group') {
      let hasVisible = false;
      for (let j = i + 1; j < tab.fields.length && tab.fields[j].kind !== 'group'; j++) {
        if (isFieldVisible(tab.fields[j], draft)) { hasVisible = true; break; }
      }
      if (hasVisible) out.push(f);
    } else if (isFieldVisible(f, draft)) {
      out.push(f);
    }
  }
  return out;
}

export type FieldErrors = Record<string, string>;

/**
 * Client-side validation over the visible fields: required, numeric bounds,
 * integer-ness, patterns. Returns `{ key: message }`; empty when clean.
 * Messages go through `t` so the builder stays usable from tests with the
 * identity translator.
 */
export function validateDraft(
  tabs: TabDef[],
  draft: Record<string, FieldValue>,
  t: Translate = (k) => k,
): FieldErrors {
  const errors: FieldErrors = {};
  const interpolate = (s: string, vars: Record<string, string | number>) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
  for (const tab of tabs) {
    for (const f of visibleFields(tab, draft)) {
      if (f.kind === 'group' || errors[f.key]) continue;
      const v = draft[f.key];
      const empty = v == null || String(v).trim() === '';
      if (f.required && empty) {
        errors[f.key] = t('Required.');
        continue;
      }
      if (empty) continue;
      if (f.kind === 'number' || f.kind === 'resolution') {
        const n = Number(v);
        if (!Number.isFinite(n)) { errors[f.key] = t('Must be a number.'); continue; }
        if (f.integer && !Number.isInteger(n)) { errors[f.key] = t('Must be a whole number.'); continue; }
        if (f.min != null && n < f.min) { errors[f.key] = interpolate(t('Must be at least {{min}}.'), { min: f.min }); continue; }
        if (f.max != null && n > f.max) { errors[f.key] = interpolate(t('Must be at most {{max}}.'), { max: f.max }); continue; }
        if (f.kind === 'resolution') {
          const h = Number(draft.height);
          if (!(n >= 1) || !(h >= 1) || !Number.isInteger(n) || !Number.isInteger(h)) {
            errors[f.key] = t('Width and height must be whole numbers of at least 1.');
          }
        }
      }
      if (f.pattern && !f.pattern.test(String(v))) {
        errors[f.key] = f.patternHelp ?? t('Invalid value.');
      }
    }
  }
  return errors;
}

/**
 * zm_api's 422 envelope carries `details` as `[[field, message], …]`;
 * older builds used `[{ field: message }]` or `[{ field, message }]`. Map
 * any of those to `{ field: message }` so the editor can mark the inputs.
 */
export function fieldErrorsFromDetails(details: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (!Array.isArray(details)) return out;
  for (const entry of details) {
    if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string') {
      out[entry[0]] = String(entry[1]);
    } else if (entry && typeof entry === 'object') {
      const rec = entry as Record<string, unknown>;
      if (typeof rec.field === 'string') {
        out[rec.field] = String(rec.message ?? rec.error ?? rec.reason ?? '');
      } else {
        for (const [k, v] of Object.entries(rec)) out[k] = String(v);
      }
    }
  }
  return out;
}

/** The tab a field lives on (first match), for jumping to a backend error. */
export function tabForField(tabs: TabDef[], key: string): string | undefined {
  return tabs.find((tab) => tab.fields.some((f) => f.key === key))?.id;
}
