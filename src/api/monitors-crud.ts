import i18next from '@/i18n';
import { apiPost, apiPatch, apiDelete } from './client';
import { getMonitor, normalizeMonitor } from './monitors';
import { getStorageList } from './storage';
import type { Monitor } from '@/types';

/**
 * Body of `POST /monitors`. Same fields as a `Monitor` read, minus the
 * server-assigned `id`, with `deleted` as the boolean the request schema
 * demands (reads echo it as 0/1). `contract.test.ts` checks the key set
 * against `CreateMonitorRequest` in the OpenAPI snapshot.
 */
export type MonitorCreatePayload = Omit<Monitor, 'id' | 'deleted'> & { deleted: boolean };

/**
 * The backend's CreateMonitorRequest demands ~100 fields with no nullable
 * defaults. Most are knobs an operator never touches at creation time —
 * codec params, label positioning, motion-detection thresholds, etc. We
 * expose only the essentials in the UI and fill everything else from this
 * defaults blob.
 *
 * Values follow ZoneMinder's own new-monitor defaults except where the
 * backend rejects them (BT-20): image adjustments are 0 rather than -1
 * ("camera default"), `max_image_buffer_count` / `stream_replay_buffer`
 * must be ≥ 1 (ZM uses 0 for unlimited / off), and `storage_id` must name
 * a real row — 0 here means "resolve from GET /storage at create time".
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
  max_image_buffer_count: 121, // ZM writes 0 (unlimited); backend wants ≥ 1 — value the dev-box monitors carry
  warmup_count: 0,
  pre_event_count: 0,
  post_event_count: 5,
  stream_replay_buffer: 1, // ZM writes 0 (off); backend wants ≥ 1
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
  signal_check_colour: '#0000c0',

  // Image
  width: 1920,
  height: 1080,
  colours: 4,
  brightness: 0, // ZM writes -1 ("camera default"); backend wants ≥ 0
  contrast: 0,
  hue: 0,
  colour: 0,
  orientation: 'Rotate0',
  label_format: null,
  label_x: 0,
  label_y: 0,
  label_size: 1,
  web_colour: 'red',

  // Relationships
  storage_id: 0, // sentinel: resolved via resolveStorageId()
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
 * Backend minimums that ZoneMinder's own stored values violate (BT-20).
 * Applied when turning an existing record into a create payload.
 */
const CREATE_FLOORS: ReadonlyArray<{ key: keyof MonitorCreatePayload; min: number }> = [
  { key: 'brightness', min: 0 },
  { key: 'contrast', min: 0 },
  { key: 'hue', min: 0 },
  { key: 'colour', min: 0 },
  { key: 'max_image_buffer_count', min: 1 },
  { key: 'stream_replay_buffer', min: 1 },
];

/**
 * Turn a monitor as read from the API into a body `POST /monitors` accepts:
 * only request fields (drops `id` and anything the server added), request
 * enum casing, boolean `deleted`, non-null `output_container`, a fresh
 * `sequence`, and values under a backend minimum lifted to the default.
 * `storage_id` is passed through — callers resolve a 0 with
 * {@link resolveStorageId} because that needs a request.
 */
export function toCreatePayload(
  source: Monitor,
  overrides: Partial<MonitorCreatePayload> = {},
): MonitorCreatePayload {
  const src = normalizeMonitor(source) as unknown as Record<string, unknown>;
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

/** A valid `storage_id`: the given one if it names a row (≥ 1), else the first storage area. */
export async function resolveStorageId(candidate: number | null | undefined): Promise<number> {
  if (candidate != null && candidate >= 1) return candidate;
  const page = await getStorageList({ page: 1, page_size: 1 });
  const id = page.items[0]?.id;
  if (!id) {
    throw new Error(i18next.t('No storage area is defined. Add one under Settings → Storage first.'));
  }
  return id;
}

/** A skeleton CreateMonitorRequest with the essential fields overridden. */
export interface MonitorCreateInput {
  name: string;
  type?: 'Local' | 'Remote' | 'File' | 'Ffmpeg' | 'Libvlc' | 'Curl' | 'WebSite' | 'Vnc';
  host?: string | null;
  port?: string;
  user?: string | null;
  pass?: string | null;
  path?: string | null;
  width?: number;
  height?: number;
  function?: 'None' | 'Monitor' | 'Modect' | 'Record' | 'Mocord' | 'Nodect';
  /** Defaults to the first storage area. */
  storage_id?: number;
}

export async function createMonitor(input: MonitorCreateInput): Promise<Monitor> {
  // Use a complete defaults blob — the backend requires every property.
  // Coerce a few related fields together: function presets imply analysing
  // and recording, but the user just picks a function on the UI.
  const fn = input.function ?? 'Modect';
  const payload: MonitorCreatePayload = {
    ...MONITOR_CREATE_DEFAULTS,
    ...input,
    storage_id: await resolveStorageId(input.storage_id),
    function: fn,
    // Function None is ZoneMinder's "disabled": nothing captures, so no daemon starts.
    capturing: fn === 'None' ? 'None' : 'Always',
    analysing: (fn === 'None' || fn === 'Monitor') ? 'None' : 'Always',
    recording: (fn === 'Record' || fn === 'Mocord') ? 'Always'
              : (fn === 'Modect') ? 'OnMotion' : 'None',
  };
  return normalizeMonitor(await apiPost<MonitorCreatePayload, Monitor>('/monitors', payload));
}

/**
 * Clone an existing monitor. Fetches the full record, converts it to a
 * create payload, suffixes the name with "(clone)", and POSTs as new.
 */
export async function cloneMonitor(sourceId: number, newName?: string): Promise<Monitor> {
  const src = await getMonitor(sourceId);
  const payload = toCreatePayload(src, { name: newName ?? `${src.name} (clone)` });
  payload.storage_id = await resolveStorageId(payload.storage_id);
  return normalizeMonitor(await apiPost<MonitorCreatePayload, Monitor>('/monitors', payload));
}

export async function deleteMonitor(id: number): Promise<void> {
  return apiDelete(`/monitors/${id}`);
}

export async function patchMonitor(
  id: number,
  changes: Partial<Record<string, unknown>>,
): Promise<Monitor> {
  return normalizeMonitor(await apiPatch<typeof changes, Monitor>(`/monitors/${id}`, changes));
}
