import type { Monitor } from '@/types';
import type { MonitorStatusRecord } from '@/api/monitorStatus';
import type { Control } from '@/api/controls';
import type { Zone } from '@/api/zones';

/**
 * A monitor exactly as `GET /api/v3/monitors` serves one: every required
 * field of `MonitorResponse`, and the *raw DB* enum spellings the live
 * backend echoes (`ROTATE_0`, `system`, `auto`, `WebRTC`) rather than the
 * request-side casing. `normalizeMonitor()` in `src/api/monitors.ts` is what
 * turns them into `Rotate0`/`System`/`Auto`/`WebRtc`, so fixtures that used
 * the tidy casing would silently skip that conversion.
 */
export function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: 'Front Door',
    deleted: 0,
    notes: null,
    server_id: null,
    storage_id: 1,
    manufacturer_id: null,
    model_id: null,
    type: 'Ffmpeg',
    function: 'Mocord',
    capturing: 'Always',
    decoding_enabled: 1,
    decoding: 'Always',
    rtsp2_web_enabled: 0,
    rtsp2_web_type: 'WebRTC',
    janus_enabled: 0,
    janus_audio_enabled: 0,
    janus_profile_override: null,
    restream: 0,
    rtsp_user: null,
    janus_rtsp_session_timeout: null,
    linked_monitors: null,
    triggers: '',
    event_start_command: '',
    event_end_command: '',
    onvif_url: '',
    onvif_events_path: '',
    onvif_username: '',
    onvif_password: '',
    onvif_options: '',
    onvif_event_listener: 0,
    onvif_alarm_text: null,
    use_amcrest_api: 0,
    device: '',
    channel: 0,
    format: 0,
    v4l_multi_buffer: null,
    v4l_captures_per_frame: null,
    protocol: null,
    method: null,
    host: null,
    port: '',
    sub_path: '',
    path: 'rtsp://camera.local:554/stream1',
    second_path: null,
    options: null,
    user: null,
    pass: null,
    width: 1920,
    height: 1080,
    colours: 4,
    palette: 0,
    orientation: 'ROTATE_0',
    deinterlacing: 0,
    decoder: null,
    decoder_hw_accel_name: null,
    decoder_hw_accel_device: null,
    save_jpe_gs: 0,
    video_writer: 1,
    output_codec: null,
    encoder: null,
    output_container: null,
    encoder_parameters: null,
    record_audio: 0,
    recording_source: 'Primary',
    rtsp_describe: 0,
    brightness: -1,
    contrast: -1,
    hue: -1,
    colour: -1,
    event_prefix: 'Event-',
    label_format: '%N - %d/%m/%y %H:%M:%S',
    label_x: 0,
    label_y: 0,
    label_size: 1,
    image_buffer_count: 20,
    max_image_buffer_count: 0,
    warmup_count: 0,
    pre_event_count: 5,
    post_event_count: 5,
    stream_replay_buffer: 0,
    alarm_frame_count: 1,
    section_length: 600,
    section_length_warn: 1,
    event_close_mode: 'system',
    min_section_length: 10,
    frame_skip: 0,
    motion_frame_skip: 0,
    analysis_fps_limit: null,
    analysis_update_delay: 0,
    max_fps: null,
    alarm_max_fps: null,
    fps_report_interval: 100,
    ref_blend_perc: 6,
    alarm_ref_blend_perc: 6,
    controllable: 0,
    control_id: null,
    control_device: null,
    control_address: null,
    auto_stop_timeout: null,
    track_motion: 0,
    track_delay: null,
    return_location: -1,
    return_delay: null,
    modect_during_ptz: 0,
    default_rate: 100,
    default_scale: '100',
    default_codec: 'auto',
    signal_check_points: 0,
    signal_check_colour: '#0000BE',
    web_colour: 'red',
    exif: 0,
    sequence: 1,
    zone_count: 1,
    refresh: null,
    latitude: null,
    longitude: null,
    rtsp_server: 0,
    rtsp_stream_name: '',
    soap_wsa_compl: 1,
    importance: 'Normal',
    mqtt_enabled: 0,
    mqtt_subscriptions: '',
    startup_delay: 0,
    analysing: 'Always',
    analysis_source: 'Primary',
    analysis_image: 'FullColour',
    recording: 'OnMotion',
    ...overrides,
  };
}

/** A row from `GET /api/v3/monitor-status` — fps come back as strings. */
export function makeMonitorStatus(
  overrides: Partial<MonitorStatusRecord> = {},
): MonitorStatusRecord {
  return {
    monitor_id: 1,
    status: 'Connected',
    capture_fps: '15.00',
    analysis_fps: '5.00',
    capture_bandwidth: 524288,
    updated_on: '2026-08-21T09:00:00Z',
    ...overrides,
  };
}

/** Every 0/1 capability column of `ControlResponse`, plus the two counts. */
const CONTROL_FLAGS = [
  'can_auto_focus', 'can_auto_gain', 'can_auto_iris', 'can_auto_scan', 'can_auto_white',
  'can_auto_zoom', 'can_focus', 'can_focus_abs', 'can_focus_con', 'can_focus_rel',
  'can_gain', 'can_gain_abs', 'can_gain_con', 'can_gain_rel', 'can_iris', 'can_iris_abs',
  'can_iris_con', 'can_iris_rel', 'can_move', 'can_move_abs', 'can_move_con',
  'can_move_diag', 'can_move_map', 'can_move_rel', 'can_pan', 'can_reboot', 'can_reset',
  'can_set_presets', 'can_sleep', 'can_tilt', 'can_wake', 'can_white', 'can_white_abs',
  'can_white_con', 'can_white_rel', 'can_zoom', 'can_zoom_abs', 'can_zoom_con',
  'can_zoom_rel', 'has_focus_speed', 'has_gain_speed', 'has_home_preset', 'has_iris_speed',
  'has_pan_speed', 'has_presets', 'has_tilt_speed', 'has_turbo_pan', 'has_turbo_tilt',
  'has_white_speed', 'has_zoom_speed', 'num_presets', 'num_scan_paths',
] as const;

type ControlFlags = Record<(typeof CONTROL_FLAGS)[number], number>;

/** A PTZ control profile (`GET /api/v3/controls`). Pan/tilt/zoom + presets on. */
export function makeControl(overrides: Partial<Control> = {}): Control {
  const flags = Object.fromEntries(CONTROL_FLAGS.map((k) => [k, 0])) as ControlFlags;
  return {
    ...flags,
    id: 1,
    name: 'ONVIF PTZ',
    type: 'Ffmpeg',
    protocol: 'onvif',
    can_pan: 1,
    can_tilt: 1,
    can_zoom: 1,
    can_move: 1,
    can_move_con: 1,
    can_move_rel: 1,
    has_presets: 1,
    can_set_presets: 1,
    num_presets: 8,
    num_scan_paths: 0,
    ...overrides,
  };
}

/** A motion zone (`GET /api/v3/monitors/{id}/zones`). Coords are "x,y x,y …". */
export function makeZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 1,
    monitor_id: 1,
    name: 'All',
    type: 'Active',
    units: 'Percent',
    coords: '0,0 1919,0 1919,1079 0,1079',
    num_coords: 4,
    ...overrides,
  };
}
