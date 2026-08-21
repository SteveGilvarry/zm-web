import { apiPost, apiPatch, apiDelete } from './client';
import { getMonitor } from './monitors';
import type { Monitor } from '@/types';

/**
 * Body of `POST /monitors`. Same fields as a `Monitor` read, minus the
 * server-assigned `id`, plus `pass` / `onvif_password` — those are
 * write-only, so `MonitorResponse` omits them but the create request still
 * takes them. `contract.test.ts` checks the key set against
 * `CreateMonitorRequest` in the OpenAPI snapshot.
 */
export type MonitorCreatePayload = Omit<Monitor, 'id' | 'deleted'> & {
  deleted: boolean;
  pass: string | null;
  onvif_password: string;
};

/**
 * The backend's CreateMonitorRequest demands ~100 fields with no nullable
 * defaults. Most are knobs an operator never touches at creation time —
 * codec params, label positioning, motion-detection thresholds, etc. We
 * expose only the essentials in the UI and fill everything else from this
 * defaults blob.
 *
 * Values are ZoneMinder's own new-monitor defaults, so a row created here
 * is indistinguishable from one the legacy UI made. An earlier build
 * rejected several of them (zm-api#19) and we substituted safe-but-wrong
 * numbers; the dev box of 2026-08-22 takes the real ones — probed field by
 * field through `createMonitor`. The one it still refuses is
 * `image_buffer_count: 0` ("lower than 1"), which does not matter because
 * ZoneMinder's default there is 3 anyway; see {@link CREATE_FLOORS}.
 */
export const MONITOR_CREATE_DEFAULTS: MonitorCreatePayload = {
  // Identity / basic
  name: 'New monitor',
  type: 'Ffmpeg',
  function: 'Modect',
  notes: '',
  importance: 'Normal',
  deleted: false,

  // Source
  protocol: '',
  method: 'rtpRtsp',
  host: '',
  port: '',
  user: '',
  pass: '',
  path: '',
  sub_path: '',
  second_path: null,
  options: null,
  device: '',
  channel: 0,
  format: 0,
  palette: 0,
  rtsp_describe: 0,
  v4l_captures_per_frame: null,
  v4l_multi_buffer: null,

  // Run modes
  capturing: 'Always',
  decoding: 'Always',
  decoding_enabled: 1,
  analysing: 'Always',
  analysis_source: 'Primary',
  analysis_image: 'FullColour',
  recording: 'OnMotion',
  recording_source: 'Primary',

  // Codec / output
  decoder: null,
  decoder_hw_accel_device: null,
  decoder_hw_accel_name: null,
  encoder: null,
  encoder_parameters: null,
  default_codec: 'Auto',
  output_container: 'Auto',
  output_codec: null,
  video_writer: 1,
  save_jpe_gs: 0,
  record_audio: 0,
  default_rate: 100,
  default_scale: '0',

  // Analysis tuning
  analysis_fps_limit: null,
  analysis_update_delay: 0,
  max_fps: null,
  alarm_max_fps: null,
  fps_report_interval: 250,
  ref_blend_perc: 6,
  alarm_ref_blend_perc: 6,
  frame_skip: 0,
  motion_frame_skip: 0,

  // PTZ
  controllable: 0,
  control_id: null,
  control_address: null,
  control_device: null,
  auto_stop_timeout: null,
  track_motion: 0,
  track_delay: null,
  return_location: -1,
  return_delay: null,
  modect_during_ptz: 0,

  // Buffers / events
  image_buffer_count: 3,
  max_image_buffer_count: 0, // 0 = unlimited, as ZoneMinder writes
  warmup_count: 0,
  pre_event_count: 0,
  post_event_count: 5,
  stream_replay_buffer: 0, // 0 = live-replay scrubbing off, as ZoneMinder writes
  alarm_frame_count: 1,
  section_length: 600,
  section_length_warn: 0,
  min_section_length: 30,
  event_close_mode: 'Idle',
  event_prefix: 'Event-',
  event_start_command: '',
  event_end_command: '',
  startup_delay: 0,
  refresh: null,
  exif: 0,
  deinterlacing: 0,
  signal_check_points: 0,
  signal_check_colour: '#0000be',

  // Image
  width: 1920,
  height: 1080,
  colours: 4,
  // -1 is ZoneMinder's "leave it to the camera"; 0–100 is an explicit level.
  brightness: -1,
  contrast: -1,
  hue: -1,
  colour: -1,
  orientation: 'Rotate0',
  label_format: null,
  label_x: 0,
  label_y: 0,
  label_size: 1,
  web_colour: 'red',

  // Relationships
  storage_id: 0, // ZoneMinder's "Default" storage area
  server_id: null,
  sequence: null,
  manufacturer_id: null,
  model_id: null,
  linked_monitors: null,
  triggers: '',
  zone_count: 1,
  latitude: null,
  longitude: null,

  // ONVIF
  onvif_url: '',
  onvif_username: '',
  onvif_password: '',
  onvif_options: '',
  onvif_event_listener: 0,
  onvif_events_path: '',
  onvif_alarm_text: '',
  soap_wsa_compl: 0,
  use_amcrest_api: 0,

  // Streaming servers
  janus_enabled: 0,
  janus_audio_enabled: 0,
  janus_profile_override: null,
  janus_rtsp_session_timeout: null,
  restream: 0,
  rtsp_user: null,
  rtsp2_web_enabled: 0,
  rtsp2_web_type: 'Mse',
  rtsp_server: 0,
  rtsp_stream_name: '',
  mqtt_enabled: 0,
  mqtt_subscriptions: '',
};

/**
 * The one backend minimum a ZoneMinder row can violate: `ImageBufferCount`
 * may legally be 0 in the DB, but `POST /monitors` answers "lower than 1".
 * Applied when turning an existing record into a create payload so cloning
 * such a monitor does not 422.
 */
const CREATE_FLOORS: ReadonlyArray<{ key: keyof MonitorCreatePayload; min: number }> = [
  { key: 'image_buffer_count', min: 1 },
];

/**
 * Turn a monitor as read from the API into a body `POST /monitors` accepts:
 * only request fields (drops `id` and anything the server added), a
 * boolean `deleted`, non-null `output_container`, a fresh `sequence`, and
 * values under a backend minimum lifted to the default. The camera and
 * ONVIF passwords are write-only, so a read never carries them and a clone
 * starts without credentials — the operator retypes them in the editor.
 */
export function toCreatePayload(
  source: Monitor,
  overrides: Partial<MonitorCreatePayload> = {},
): MonitorCreatePayload {
  const src = source as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...MONITOR_CREATE_DEFAULTS };
  for (const key of Object.keys(MONITOR_CREATE_DEFAULTS)) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  out.deleted = false;
  out.sequence = null;
  out.output_container ??= MONITOR_CREATE_DEFAULTS.output_container;
  for (const { key, min } of CREATE_FLOORS) {
    const n = Number(out[key]);
    if (!Number.isFinite(n) || n < min) out[key] = MONITOR_CREATE_DEFAULTS[key];
  }
  return { ...(out as MonitorCreatePayload), ...overrides };
}

/**
 * What the Add dialog, the preset picker and ONVIF discovery can set on a
 * new monitor: `name` plus any request field. Everything else comes from
 * `MONITOR_CREATE_DEFAULTS`. `type`/`function` are narrowed to the request
 * enums so a typo fails to compile rather than 422 at runtime.
 */
export type MonitorCreateInput =
  Partial<Omit<MonitorCreatePayload, 'name' | 'type' | 'function' | 'storage_id'>> & {
    name: string;
    type?: 'Local' | 'Remote' | 'File' | 'Ffmpeg' | 'Libvlc' | 'Curl' | 'WebSite' | 'Vnc';
    function?: 'None' | 'Monitor' | 'Modect' | 'Record' | 'Mocord' | 'Nodect';
    /** Defaults to 0 — ZoneMinder's "Default" storage area. */
    storage_id?: number;
  };

/** Drop `undefined` so a partial input never knocks out a required default. */
function defined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function createMonitor(input: MonitorCreateInput): Promise<Monitor> {
  // Use a complete defaults blob — the backend requires every property.
  // Coerce a few related fields together: function presets imply analysing
  // and recording, but the user just picks a function on the UI.
  const fn = input.function ?? 'Modect';
  const payload: MonitorCreatePayload = {
    ...MONITOR_CREATE_DEFAULTS,
    ...defined(input),
    function: fn,
    // Function None is ZoneMinder's "disabled": nothing captures, so no daemon starts.
    capturing: fn === 'None' ? 'None' : 'Always',
    analysing: (fn === 'None' || fn === 'Monitor') ? 'None' : 'Always',
    recording: (fn === 'Record' || fn === 'Mocord') ? 'Always'
              : (fn === 'Modect') ? 'OnMotion' : 'None',
  };
  return apiPost<MonitorCreatePayload, Monitor>('/monitors', payload);
}

/**
 * Clone an existing monitor. Fetches the full record, converts it to a
 * create payload, suffixes the name with "(clone)", and POSTs as new.
 */
export async function cloneMonitor(sourceId: number, newName?: string): Promise<Monitor> {
  const src = await getMonitor(sourceId);
  const payload = toCreatePayload(src, { name: newName ?? `${src.name} (clone)` });
  return apiPost<MonitorCreatePayload, Monitor>('/monitors', payload);
}

export async function deleteMonitor(id: number): Promise<void> {
  return apiDelete(`/monitors/${id}`);
}

export async function patchMonitor(
  id: number,
  changes: Partial<Record<string, unknown>>,
): Promise<Monitor> {
  return apiPatch<typeof changes, Monitor>(`/monitors/${id}`, changes);
}
