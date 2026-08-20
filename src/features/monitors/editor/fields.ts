/**
 * Catalog of editable monitor fields, grouped into tabs that mirror the
 * legacy ZM monitor-edit sidebar. Each entry says how to render the field
 * (text / number / select / toggle / textarea), what its label and optional
 * help-text are, and — for selects — the enum options.
 *
 * Field names match the backend Monitor schema so we can both populate from
 * the read response and PATCH only the changed keys.
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
  /** Dropdown sourced live from /api/v3/controls (PTZ-driver catalogue). */
  | 'control-select'
  | 'group';

export interface FieldDef {
  kind: FieldKind;
  key: string;
  label: string;
  help?: string;
  /** For 'select'. */
  options?: Array<{ value: string | number; label: string }>;
  /** Optional width hint inside the 2-col grid. Default: 1 col. */
  span?: 1 | 2;
  /** Optional placeholder for text-type inputs. */
  placeholder?: string;
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
   * Legacy ZM label-size enum stored as a small int (0–3). Maps to the four
   * fonts the capture daemon bakes into JPEGs. Default lines up with the legacy
   * "Default" font.
   */
  const LABEL_SIZE_OPTIONS = [
    { value: 0, label: t('Small') },
    { value: 1, label: t('Default') },
    { value: 2, label: t('Large') },
    { value: 3, label: t('Extra Large') },
  ];

  /**
   * Legacy `ReturnLocation` is stored as an int. -1 disables auto-return;
   * 0 sends the PTZ head back to its Home preset after the idle timer; any
   * positive value matches a `ControlPresets` row id. We surface the two
   * common sentinels here — operators with custom presets must edit them via
   * the controlcaps editor.
   */
  const RETURN_LOCATION_OPTIONS = [
    { value: -1, label: t('None (no return)') },
    { value: 0,  label: t('Home preset') },
  ];

  /** RTSP transport (`Monitors.Method`). Wire values are ZM's, labels are the legacy FFmpeg-source ones. */
  const METHOD_OPTIONS = [
    { value: 'rtpRtsp',     label: t('TCP') },
    { value: 'rtpUni',      label: t('UDP') },
    { value: 'rtpMulti',    label: t('UDP multicast') },
    { value: 'rtpRtspHttp', label: t('HTTP tunnel') },
  ];

  /** `SaveJPEGs` is a 0–3 bitmask: bit 0 = capture frames, bit 1 = analysis frames. */
  const SAVE_JPEGS_OPTIONS = [
    { value: 0, label: t('Disabled') },
    { value: 1, label: t('Frames only') },
    { value: 2, label: t('Analysis images only (if available)') },
    { value: 3, label: t('Frames + Analysis images') },
  ];

  return [
    {
      id: 'general',
      label: t('General'),
      description: t('Identity and notes.'),
      fields: [
        { kind: 'text',      key: 'name',         label: t('Name'), span: 2 },
        { kind: 'textarea',  key: 'notes',        label: t('Notes'), span: 2,
          help: t('Free-form metadata. ZoneMinder convention: key=value pairs.') },
        { kind: 'select',    key: 'function',     label: t('Function'), span: 2,
          options: FUNCTION_OPTIONS,
          help: t('Master switch that controls how the monitor captures, analyses, and records.') },
        { kind: 'select',    key: 'importance',   label: t('Importance'), options: IMPORTANCE_OPTIONS },
        { kind: 'select',    key: 'type',         label: t('Source type'), options: MONITOR_TYPE_OPTIONS,
          help: t('Backend used to ingest the camera feed.') },
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
        { kind: 'text',      key: 'protocol',     label: t('Protocol'),
          help: t('e.g. rtsp, http. Leave blank to let FFmpeg autodetect.') },
        { kind: 'select',    key: 'method',       label: t('Method'), options: METHOD_OPTIONS,
          help: t('RTSP transport. TCP is the reliable default; UDP has lower latency but drops frames on a busy network.') },
        { kind: 'text',      key: 'host',         label: t('Host'), span: 2 },
        { kind: 'text',      key: 'port',         label: t('Port') },
        { kind: 'text',      key: 'path',         label: t('Path'), span: 2 },
        { kind: 'text',      key: 'second_path',  label: t('Secondary path'), span: 2,
          help: t('Optional low-res stream for analysis while keeping the primary for recording.') },
        { kind: 'text',      key: 'user',         label: t('Username') },
        { kind: 'password',  key: 'pass',         label: t('Password') },
        { kind: 'text',      key: 'options',      label: t('Extra options'), span: 2 },

        { kind: 'group',     key: '_image',       label: t('Image') },
        { kind: 'number',    key: 'width',        label: t('Width (px)') },
        { kind: 'number',    key: 'height',       label: t('Height (px)') },
        { kind: 'select',    key: 'orientation',  label: t('Orientation'), options: ORIENTATION_OPTIONS,
          help: t('Rotates / flips the displayed image. Affects live and recorded frames.') },
        { kind: 'number',    key: 'deinterlacing', label: t('Deinterlacing') },
        { kind: 'number',    key: 'max_fps',      label: t('Max FPS'), help: t('0 = unlimited.') },
        { kind: 'number',    key: 'alarm_max_fps',label: t('Alarm max FPS'), help: t('0 = unlimited.') },
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
        { kind: 'number', key: 'analysis_fps_limit',  label: t('Analysis FPS limit'),
          help: t('0 = match capture FPS. Lower values reduce CPU at the cost of slower motion detection.') },
        { kind: 'number', key: 'ref_blend_perc',      label: t('Ref image blend %'),
          help: t('How fast the reference frame absorbs new pixels. Higher = adapts faster, misses slower motion.') },
        { kind: 'number', key: 'alarm_ref_blend_perc',label: t('Alarm ref blend %') },
        { kind: 'number', key: 'analysis_update_delay', label: t('Analysis update delay (s)') },
        { kind: 'toggle', key: 'track_motion',        label: t('Track motion frames') },
        { kind: 'toggle', key: 'modect_during_ptz',   label: t('Detect during PTZ') },
      ],
    },
    {
      id: 'recording',
      label: t('Recording'),
      description: t('When and how events are written to disk.'),
      fields: [
        { kind: 'select', key: 'recording',          label: t('Recording'),         options: RUN_MODE_RECORDING },
        { kind: 'select', key: 'recording_source',   label: t('Recording source'),  options: RECORDING_SOURCE_OPTIONS },
        { kind: 'number', key: 'storage_id',         label: t('Storage area ID') },
        { kind: 'select', key: 'save_jpe_gs',        label: t('Save JPEGs'), options: SAVE_JPEGS_OPTIONS,
          help: t('Stores per-frame JPEGs in addition to the video — large disk cost; needed for some legacy tooling.') },
        { kind: 'toggle', key: 'record_audio',       label: t('Record audio') },
        { kind: 'select', key: 'output_container',   label: t('Output container'),  options: OUTPUT_CONTAINER_OPTIONS },
        { kind: 'select', key: 'event_close_mode',   label: t('Event close mode'),  options: EVENT_CLOSE_MODE_OPTIONS },
        { kind: 'text',   key: 'event_prefix',       label: t('Event prefix') },
        { kind: 'text',   key: 'event_start_command',label: t('Event start command'), span: 2 },
        { kind: 'text',   key: 'event_end_command',  label: t('Event end command'),   span: 2 },
        { kind: 'text',   key: 'encoder',            label: t('Encoder') },
        { kind: 'text',   key: 'encoder_parameters', label: t('Encoder parameters'), span: 2 },
        { kind: 'number', key: 'section_length',     label: t('Section length (s)'),
          help: t('Continuous recordings split into events of this length.') },
      ],
    },
    {
      id: 'buffers',
      label: t('Buffers'),
      description: t('Frame buffer sizing — read-most-do-not-touch territory.'),
      fields: [
        { kind: 'number', key: 'image_buffer_count',      label: t('Image buffer size (frames)') },
        { kind: 'number', key: 'max_image_buffer_count',  label: t('Max image buffer (frames)') },
        { kind: 'number', key: 'warmup_count',            label: t('Warmup frames') },
        { kind: 'number', key: 'pre_event_count',         label: t('Pre-event frames') },
        { kind: 'number', key: 'post_event_count',        label: t('Post-event frames') },
        { kind: 'number', key: 'stream_replay_buffer',    label: t('Stream replay buffer') },
        { kind: 'number', key: 'alarm_frame_count',       label: t('Alarm frame count') },
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
        { kind: 'number', key: 'default_rate',        label: t('Default rate (%)') },
        { kind: 'text',   key: 'default_scale',       label: t('Default scale') },
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
        { kind: 'number', key: 'label_x',             label: t('Timestamp label X'),
          help: t('Pixel offset from the left edge of the frame.') },
        { kind: 'number', key: 'label_y',             label: t('Timestamp label Y'),
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
          help: t('PTZ driver template from the Controls catalogue (Pelco-D, Hikvision, ONVIF …).') },
        { kind: 'text',           key: 'control_device',    label: t('Control device'),
          placeholder: 'Profile_1',
          help: t('Profile token (ONVIF) or serial device path (e.g. /dev/ttyS0).') },
        { kind: 'text',           key: 'control_address',   label: t('Control address'),
          placeholder: 'user:pass@ip',
          help: t('Override address — leave blank to reuse the monitor source credentials.') },
        { kind: 'number',         key: 'auto_stop_timeout', label: t('Auto stop timeout (s)'),
          help: t('Stops a continuous PTZ move after N seconds even if no stop command arrives.') },
        { kind: 'toggle',         key: 'track_motion',      label: t('Track motion'),
          help: t('When ON, the head moves to follow detected motion until the return delay elapses.') },
        { kind: 'number',         key: 'track_delay',       label: t('Track delay (s)'),
          help: t('Seconds between motion-tracking moves.') },
        { kind: 'select',         key: 'return_location',   label: t('Return location'),
          options: RETURN_LOCATION_OPTIONS,
          help: t('Where the head returns to once tracking ends. Use the Controls editor for custom presets.') },
        { kind: 'number',         key: 'return_delay',      label: t('Return delay (s)'),
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
      description: t('Branding, geolocation, and other low-traffic settings.'),
      fields: [
        { kind: 'text',   key: 'web_colour',          label: t('Web colour'),
          help: t('CSS colour used in lists / montage to identify this camera.') },
        { kind: 'text',   key: 'latitude',            label: t('Latitude') },
        { kind: 'text',   key: 'longitude',           label: t('Longitude') },
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
