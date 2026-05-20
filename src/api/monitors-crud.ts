import { apiPost, apiPatch, apiDelete, apiGet } from './client';
import type { Monitor } from '@/types';

/**
 * The backend's CreateMonitorRequest demands ~100 fields with no nullable
 * defaults. Most are knobs an operator never touches at creation time —
 * codec params, label positioning, motion-detection thresholds, etc. We
 * expose only the essentials in the UI and fill everything else from this
 * defaults blob, which mirrors a fresh-install factory record.
 *
 * If a clone is requested, we instead start from the source monitor's full
 * record and override `name` + clear `id`.
 */
export const MONITOR_CREATE_DEFAULTS = {
  // Identity / basic
  name: 'New monitor',
  type: 'Ffmpeg' as const,
  function: 'Modect' as const,
  enabled: 1,
  notes: '',

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
  device: '',
  channel: 0,
  format: 0,
  palette: 0,
  rtsp_describe: 0,

  // Capture
  capturing: 'Always' as const,
  decoding: 'Always' as const,
  analysing: 'Always' as const,
  recording: 'OnMotion' as const,
  decoding_enabled: 1,
  decoder: null,
  decoder_hw_accel_device: null,
  decoder_hw_accel_name: null,
  encoder: null,
  encoder_parameters: null,
  default_codec: 'Auto' as const,
  output_container: 'Auto' as const,
  output_codec: null,
  controllable: 0,
  control_id: null,
  control_address: null,
  control_device: null,
  default_rate: 100,
  default_scale: '0',
  importance: 'Normal' as const,
  analysis_source: 'Primary' as const,
  recording_source: 'Primary' as const,
  analysis_image: 'FullColour' as const,
  analysis_fps_limit: null,
  analysis_update_delay: 0,
  max_fps: null,
  alarm_max_fps: null,
  fps_report_interval: 250,
  ref_blend_perc: 6,
  alarm_ref_blend_perc: 6,
  track_motion: 0,
  track_delay: null,
  return_location: -1,
  return_delay: null,
  modect_during_ptz: 0,
  frame_skip: 0,
  motion_frame_skip: 0,
  pre_event_count: 0,
  post_event_count: 5,
  stream_replay_buffer: 0,
  alarm_frame_count: 1,
  section_length: 600,
  section_length_warn: 0,
  min_section_length: 30,
  warmup_count: 0,
  image_buffer_count: 20,
  max_image_buffer_count: 0,
  event_close_mode: 'Idle' as const,
  event_prefix: 'Event-',
  event_start_command: '',
  event_end_command: '',
  exif: 0,
  startup_delay: 0,
  refresh: null,
  save_jpe_gs: 0,
  video_writer: 1,
  deinterlacing: 0,
  signal_check_points: 0,
  signal_check_colour: '#0000c0',

  // Image
  width: 1920,
  height: 1080,
  colours: 4,
  brightness: -1,
  contrast: -1,
  hue: -1,
  colour: -1,
  orientation: 'ROTATE_0' as const,
  label_format: null,
  label_x: 0,
  label_y: 0,
  label_size: 1,
  web_colour: 'red',

  // Storage
  storage_id: 0,
  server_id: null,
  sequence: null,
  manufacturer_id: null,
  model_id: null,

  // ONVIF / WebRTC / extras
  onvif_url: '',
  onvif_username: '',
  onvif_password: '',
  onvif_options: '',
  onvif_event_listener: 0,
  onvif_events_path: '',
  onvif_alarm_text: '',
  soap_wsa_compl: 0,
  janus_enabled: 0,
  janus_audio_enabled: 0,
  janus_use_rtsp_restream: 0,
  janus_rtsp_session_timeout: null,
  janus_rtsp_user: null,
  janus_profile_override: null,
  rtsp2_web_enabled: 0,
  rtsp2_web_type: 'mse' as const,
  rtsp_server: 0,
  rtsp_stream_name: '',
  record_audio: 0,
  use_amcrest_api: 0,
  mqtt_enabled: 0,
  mqtt_subscriptions: '',
  v4l_captures_per_frame: null,
  v4l_multi_buffer: null,
  triggers: '',
  options: null,
  linked_monitors: null,
  zone_count: 1,
  latitude: null,
  longitude: null,
  deleted: false,
};

/** A skeleton CreateMonitorRequest with the essential fields overridden. */
export interface MonitorCreateInput {
  name: string;
  type?: 'Local' | 'Remote' | 'File' | 'Ffmpeg' | 'Libvlc' | 'NVSocket' | 'cURL';
  host?: string | null;
  port?: string;
  user?: string | null;
  pass?: string | null;
  path?: string | null;
  width?: number;
  height?: number;
  function?: 'None' | 'Monitor' | 'Modect' | 'Record' | 'Mocord' | 'Nodect';
}

export async function createMonitor(input: MonitorCreateInput): Promise<Monitor> {
  // Use a complete defaults blob — the backend requires every property.
  // Coerce a few related fields together: function presets imply analysing
  // and recording, but the user just picks a function on the UI.
  const fn = input.function ?? 'Modect';
  const payload = {
    ...MONITOR_CREATE_DEFAULTS,
    ...input,
    function: fn,
    capturing: 'Always' as const,
    analysing: (fn === 'None' || fn === 'Monitor') ? 'None' : 'Always',
    recording: (fn === 'Record' || fn === 'Mocord') ? 'Always'
              : (fn === 'Modect') ? 'OnMotion' : 'None',
  };
  return apiPost<typeof payload, Monitor>('/monitors', payload);
}

/**
 * Clone an existing monitor. Fetches the full record, strips the id and
 * runtime fields, suffixes the name with "(clone)", and POSTs as new.
 */
export async function cloneMonitor(sourceId: number, newName?: string): Promise<Monitor> {
  const src = await apiGet<Monitor & Record<string, unknown>>(`/monitors/${sourceId}`);
  const { id: _id, sequence: _seq, ...rest } = src;
  void _id; void _seq;
  const payload = {
    ...MONITOR_CREATE_DEFAULTS,
    ...rest,
    name: newName ?? `${src.name} (clone)`,
  };
  return apiPost<typeof payload, Monitor>('/monitors', payload);
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
