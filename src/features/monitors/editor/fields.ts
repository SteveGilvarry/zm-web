/**
 * Catalog of editable monitor fields, grouped into tabs that mirror the
 * legacy ZM monitor-edit sidebar. Each entry says how to render the field
 * (text / number / select / toggle / textarea), what its label and optional
 * help-text are, and — for selects — the enum options.
 *
 * Field names match the backend Monitor schema so we can both populate from
 * the read response and PATCH only the changed keys.
 */

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'toggle'
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
}

export interface TabDef {
  id: string;
  label: string;
  description?: string;
  fields: FieldDef[];
}

const RUN_MODE_CAPTURING = [
  { value: 'None',     label: 'None' },
  { value: 'Ondemand', label: 'On demand' },
  { value: 'Always',   label: 'Always' },
];

const RUN_MODE_ANALYSING = [
  { value: 'None',   label: 'None' },
  { value: 'Always', label: 'Always' },
];

const RUN_MODE_RECORDING = [
  { value: 'None',     label: 'None' },
  { value: 'OnMotion', label: 'On motion' },
  { value: 'Always',   label: 'Always' },
];

const FUNCTION_OPTIONS = [
  { value: 'None',    label: 'None' },
  { value: 'Monitor', label: 'Monitor — live view, no recording' },
  { value: 'Modect',  label: 'Modect — record on motion' },
  { value: 'Record',  label: 'Record — continuous' },
  { value: 'Mocord',  label: 'Mocord — continuous + motion-tag' },
  { value: 'Nodect',  label: 'Nodect — no motion, no record' },
];

const MONITOR_TYPE_OPTIONS = [
  { value: 'Ffmpeg',  label: 'FFmpeg' },
  { value: 'Libvlc',  label: 'libVLC' },
  { value: 'Remote',  label: 'Remote (HTTP MJPEG)' },
  { value: 'Local',   label: 'Local device (V4L)' },
  { value: 'File',    label: 'File (loop)' },
  { value: 'Curl',    label: 'cURL' },
  { value: 'WebSite', label: 'Website' },
  { value: 'Vnc',     label: 'VNC' },
];

const DECODING_OPTIONS = [
  { value: 'None',                label: 'None' },
  { value: 'Ondemand',            label: 'On demand' },
  { value: 'KeyFrames',           label: 'Key frames only' },
  { value: 'KeyFramesOndemand',   label: 'Key frames + on demand' },
  { value: 'Always',              label: 'Always' },
];

const ORIENTATION_OPTIONS = [
  { value: 'Rotate0',   label: 'Default (0°)' },
  { value: 'Rotate90',  label: 'Rotate right (90°)' },
  { value: 'Rotate180', label: 'Rotate 180°' },
  { value: 'Rotate270', label: 'Rotate left (270°)' },
  { value: 'FlipHori',  label: 'Flip horizontally' },
  { value: 'FlipVert',  label: 'Flip vertically' },
];

const OUTPUT_CONTAINER_OPTIONS = [
  { value: 'Auto', label: 'Auto' },
  { value: 'Mp4',  label: 'MP4' },
  { value: 'Mkv',  label: 'MKV' },
  { value: 'Webm', label: 'WebM' },
];

const ANALYSIS_SOURCE_OPTIONS = [
  { value: 'Primary',   label: 'Primary stream' },
  { value: 'Secondary', label: 'Secondary stream' },
];

const RECORDING_SOURCE_OPTIONS = [
  { value: 'Primary',   label: 'Primary' },
  { value: 'Secondary', label: 'Secondary' },
  { value: 'Both',      label: 'Both' },
];

const ANALYSIS_IMAGE_OPTIONS = [
  { value: 'FullColour', label: 'Full colour' },
  { value: 'YChannel',   label: 'Y channel (luma only)' },
];

const EVENT_CLOSE_MODE_OPTIONS = [
  { value: 'Idle',     label: 'Idle (default)' },
  { value: 'Time',     label: 'Time-based' },
  { value: 'Duration', label: 'Fixed duration' },
  { value: 'Alarm',    label: 'On alarm end' },
  { value: 'System',   label: 'System' },
];

const IMPORTANCE_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Less',   label: 'Less' },
  { value: 'Not',    label: 'Not important' },
];

/* ------------------------------------------------------------------------ */
/*  Tabs                                                                    */
/* ------------------------------------------------------------------------ */

export const TABS: TabDef[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Identity and notes.',
    fields: [
      { kind: 'text',      key: 'name',         label: 'Name', span: 2 },
      { kind: 'textarea',  key: 'notes',        label: 'Notes', span: 2,
        help: 'Free-form metadata. ZoneMinder convention: key=value pairs.' },
      { kind: 'select',    key: 'function',     label: 'Function', span: 2,
        options: FUNCTION_OPTIONS,
        help: 'Master switch that controls how the monitor captures, analyses, and records.' },
      { kind: 'select',    key: 'importance',   label: 'Importance', options: IMPORTANCE_OPTIONS },
      { kind: 'select',    key: 'type',         label: 'Source type', options: MONITOR_TYPE_OPTIONS,
        help: 'Backend used to ingest the camera feed.' },
    ],
  },
  {
    id: 'source',
    label: 'Source',
    description: 'How the dashboard pulls frames from this camera.',
    fields: [
      { kind: 'group',     key: '_run',         label: 'Run mode' },
      { kind: 'select',    key: 'capturing',    label: 'Capturing',  options: RUN_MODE_CAPTURING },
      { kind: 'select',    key: 'decoding',     label: 'Decoding',   options: DECODING_OPTIONS },

      { kind: 'group',     key: '_endpoint',    label: 'Stream' },
      { kind: 'text',      key: 'protocol',     label: 'Protocol',
        help: 'e.g. rtsp, http. Leave blank to let FFmpeg autodetect.' },
      { kind: 'text',      key: 'method',       label: 'Method',
        help: 'TCP or UDP for RTSP — TCP is more reliable, UDP lower latency.' },
      { kind: 'text',      key: 'host',         label: 'Host', span: 2 },
      { kind: 'text',      key: 'port',         label: 'Port' },
      { kind: 'text',      key: 'path',         label: 'Path', span: 2 },
      { kind: 'text',      key: 'second_path',  label: 'Secondary path', span: 2,
        help: 'Optional low-res stream for analysis while keeping the primary for recording.' },
      { kind: 'text',      key: 'user',         label: 'Username' },
      { kind: 'text',      key: 'pass',         label: 'Password' },
      { kind: 'text',      key: 'options',      label: 'Extra options', span: 2 },

      { kind: 'group',     key: '_image',       label: 'Image' },
      { kind: 'number',    key: 'width',        label: 'Width (px)' },
      { kind: 'number',    key: 'height',       label: 'Height (px)' },
      { kind: 'select',    key: 'orientation',  label: 'Orientation', options: ORIENTATION_OPTIONS,
        help: 'Rotates / flips the displayed image. Affects live and recorded frames.' },
      { kind: 'number',    key: 'deinterlacing', label: 'Deinterlacing' },
      { kind: 'number',    key: 'max_fps',      label: 'Max FPS', help: '0 = unlimited.' },
      { kind: 'number',    key: 'alarm_max_fps',label: 'Alarm max FPS', help: '0 = unlimited.' },
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Motion-detection tuning.',
    fields: [
      { kind: 'select', key: 'analysing',           label: 'Analysing',           options: RUN_MODE_ANALYSING },
      { kind: 'select', key: 'analysis_source',     label: 'Analysis source',     options: ANALYSIS_SOURCE_OPTIONS },
      { kind: 'select', key: 'analysis_image',      label: 'Analysis image',      options: ANALYSIS_IMAGE_OPTIONS },
      { kind: 'number', key: 'analysis_fps_limit',  label: 'Analysis FPS limit',
        help: '0 = match capture FPS. Lower values reduce CPU at the cost of slower motion detection.' },
      { kind: 'number', key: 'ref_blend_perc',      label: 'Ref image blend %',
        help: 'How fast the reference frame absorbs new pixels. Higher = adapts faster, misses slower motion.' },
      { kind: 'number', key: 'alarm_ref_blend_perc',label: 'Alarm ref blend %' },
      { kind: 'number', key: 'analysis_update_delay', label: 'Analysis update delay (s)' },
      { kind: 'toggle', key: 'track_motion',        label: 'Track motion frames' },
      { kind: 'toggle', key: 'modect_during_ptz',   label: 'Detect during PTZ' },
    ],
  },
  {
    id: 'recording',
    label: 'Recording',
    description: 'When and how events are written to disk.',
    fields: [
      { kind: 'select', key: 'recording',          label: 'Recording',         options: RUN_MODE_RECORDING },
      { kind: 'select', key: 'recording_source',   label: 'Recording source',  options: RECORDING_SOURCE_OPTIONS },
      { kind: 'number', key: 'storage_id',         label: 'Storage area ID' },
      { kind: 'toggle', key: 'save_jpe_gs',        label: 'Save JPEGs',
        help: 'Stores per-frame JPEGs in addition to the video — large disk cost; needed for some legacy tooling.' },
      { kind: 'toggle', key: 'record_audio',       label: 'Record audio' },
      { kind: 'select', key: 'output_container',   label: 'Output container',  options: OUTPUT_CONTAINER_OPTIONS },
      { kind: 'select', key: 'event_close_mode',   label: 'Event close mode',  options: EVENT_CLOSE_MODE_OPTIONS },
      { kind: 'text',   key: 'event_prefix',       label: 'Event prefix' },
      { kind: 'text',   key: 'event_start_command',label: 'Event start command', span: 2 },
      { kind: 'text',   key: 'event_end_command',  label: 'Event end command',   span: 2 },
      { kind: 'text',   key: 'encoder',            label: 'Encoder' },
      { kind: 'text',   key: 'encoder_parameters', label: 'Encoder parameters', span: 2 },
      { kind: 'number', key: 'section_length',     label: 'Section length (s)',
        help: 'Continuous recordings split into events of this length.' },
    ],
  },
  {
    id: 'buffers',
    label: 'Buffers',
    description: 'Frame buffer sizing — read-most-do-not-touch territory.',
    fields: [
      { kind: 'number', key: 'image_buffer_count',      label: 'Image buffer size (frames)' },
      { kind: 'number', key: 'max_image_buffer_count',  label: 'Max image buffer (frames)' },
      { kind: 'number', key: 'warmup_count',            label: 'Warmup frames' },
      { kind: 'number', key: 'pre_event_count',         label: 'Pre-event frames' },
      { kind: 'number', key: 'post_event_count',        label: 'Post-event frames' },
      { kind: 'number', key: 'stream_replay_buffer',    label: 'Stream replay buffer' },
      { kind: 'number', key: 'alarm_frame_count',       label: 'Alarm frame count' },
    ],
  },
  {
    id: 'viewing',
    label: 'Viewing',
    description: 'Player + streaming-server toggles for the live view.',
    fields: [
      { kind: 'toggle', key: 'rtsp_server',         label: 'RTSP server' },
      { kind: 'text',   key: 'rtsp_stream_name',    label: 'RTSP stream name' },
      { kind: 'toggle', key: 'janus_enabled',       label: 'Janus WebRTC' },
      { kind: 'toggle', key: 'janus_audio_enabled', label: 'Janus audio' },
      { kind: 'toggle', key: 'janus_use_rtsp_restream', label: 'Janus RTSP restream' },
      { kind: 'toggle', key: 'rtsp2_web_enabled',   label: 'RTSP-to-Web' },
      { kind: 'number', key: 'default_rate',        label: 'Default rate (%)' },
      { kind: 'text',   key: 'default_scale',       label: 'Default scale' },
    ],
  },
  {
    id: 'misc',
    label: 'Misc',
    description: 'Branding, labels, geolocation.',
    fields: [
      { kind: 'text',   key: 'web_colour',          label: 'Web colour',
        help: 'CSS colour used in lists / montage to identify this camera.' },
      { kind: 'text',   key: 'label_format',        label: 'Label format', span: 2,
        help: 'Timestamp / overlay format. Use %N for name, %Y/%m/%d/%H/%M/%S for time.' },
      { kind: 'number', key: 'label_x',             label: 'Label X' },
      { kind: 'number', key: 'label_y',             label: 'Label Y' },
      { kind: 'number', key: 'label_size',          label: 'Label size' },
      { kind: 'text',   key: 'latitude',            label: 'Latitude' },
      { kind: 'text',   key: 'longitude',           label: 'Longitude' },
      { kind: 'toggle', key: 'mqtt_enabled',        label: 'MQTT enabled' },
      { kind: 'text',   key: 'mqtt_subscriptions',  label: 'MQTT subscriptions', span: 2 },
    ],
  },
];
