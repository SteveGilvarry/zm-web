// ============================================
// API Response Types
// ============================================

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, string>[];
}

// ============================================
// Auth Types
// ============================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserClaims {
  iat: number;
  exp: number;
  user: string;
}

// ============================================
// Monitor Types
// ============================================

// Granular monitor mode types (ZM 1.38+)
export type CapturingMode = 'None' | 'Ondemand' | 'Always';
export type AnalysingMode = 'None' | 'Always';
export type RecordingMode = 'None' | 'OnMotion' | 'Always';

export type MonitorStatus =
  | 'Unknown'
  | 'NotRunning'
  | 'Running'
  | 'Connected'
  | 'Signal';

// Monitor response from API - all fields match OpenAPI spec
export interface Monitor {
  id: number;
  name: string;
  deleted: number;
  notes?: string | null;
  server_id?: number | null;
  storage_id: number;
  manufacturer_id?: number | null;
  model_id?: number | null;
  type: string;
  function: string; // API returns string, cast to MonitorFunction for display
  capturing: string;
  enabled: number; // 0 or 1
  decoding_enabled: number; // 0 or 1
  decoding: string;
  rtsp2_web_enabled: number;
  rtsp2_web_type: string;
  janus_enabled: number;
  janus_audio_enabled: number;
  janus_profile_override?: string | null;
  janus_use_rtsp_restream: number;
  janus_rtsp_user?: number | null;
  janus_rtsp_session_timeout?: number | null;
  linked_monitors?: string | null;
  triggers: string;
  event_start_command: string;
  event_end_command: string;
  onvif_url: string;
  onvif_events_path: string;
  onvif_username: string;
  onvif_password: string;
  onvif_options: string;
  onvif_event_listener: number;
  onvif_alarm_text?: string | null;
  use_amcrest_api: number;
  device: string;
  channel: number;
  format: number;
  v4l_multi_buffer?: number | null;
  v4l_captures_per_frame?: number | null;
  protocol?: string | null;
  method?: string | null;
  host?: string | null;
  port: string;
  sub_path: string;
  path?: string | null;
  second_path?: string | null;
  options?: string | null;
  user?: string | null;
  pass?: string | null;
  width: number;
  height: number;
  colours: number;
  palette: number;
  orientation: string;
  deinterlacing: number;
  decoder?: string | null;
  decoder_hw_accel_name?: string | null;
  decoder_hw_accel_device?: string | null;
  save_jpe_gs: number;
  video_writer: number;
  output_codec?: number | null;
  encoder?: string | null;
  output_container?: string | null;
  encoder_parameters?: string | null;
  record_audio: number;
  recording_source: string;
  rtsp_describe?: number | null;
  brightness?: number | null;
  contrast?: number | null;
  hue?: number | null;
  colour?: number | null;
  event_prefix: string;
  label_format?: string | null;
  label_x: number;
  label_y: number;
  label_size: number;
  image_buffer_count: number;
  max_image_buffer_count: number;
  warmup_count: number;
  pre_event_count: number;
  post_event_count: number;
  stream_replay_buffer: number;
  alarm_frame_count: number;
  section_length: number;
  section_length_warn: number;
  event_close_mode: string;
  min_section_length: number;
  frame_skip: number;
  motion_frame_skip: number;
  analysis_fps_limit?: number | null;
  analysis_update_delay: number;
  max_fps?: number | null;
  alarm_max_fps?: number | null;
  fps_report_interval: number;
  ref_blend_perc: number;
  alarm_ref_blend_perc: number;
  controllable: number;
  control_id?: number | null;
  control_device?: string | null;
  control_address?: string | null;
  auto_stop_timeout?: number | null;
  track_motion: number;
  track_delay?: number | null;
  return_location: number;
  return_delay?: number | null;
  modect_during_ptz: number;
  default_rate: number;
  default_scale: string;
  default_codec: string;
  signal_check_points: number;
  signal_check_colour: string;
  web_colour: string;
  exif: number;
  sequence?: number | null;
  zone_count: number;
  refresh?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  rtsp_server: number;
  rtsp_stream_name: string;
  soap_wsa_compl: number;
  importance: string;
  mqtt_enabled: number;
  mqtt_subscriptions: string;
  startup_delay: number;
  analysing: string;
  analysis_source: string;
  analysis_image: string;
  recording: string;
}

export interface MonitorRuntimeStatus {
  monitor_id: number;
  status: string;
  capturing_fps?: number;
  analysing_fps?: number;
  capturing?: boolean;
}

// ============================================
// Event Types
// ============================================

export interface ZmEvent {
  id: number;
  monitor_id: number;
  storage_id: number;
  secondary_storage_id?: number | null;
  name: string;
  cause?: string | null;
  start_date_time?: string | null; // ISO8601 datetime
  end_date_time?: string | null; // ISO8601 datetime
  width: number;
  height: number;
  length: number; // Duration in seconds (decimal)
  frames: number;
  alarm_frames: number;
  default_video: string;
  save_jpe_gs?: number | null;
  tot_score: number;
  avg_score?: number | null;
  max_score?: number | null;
  archived: number; // 0 or 1
  videoed: number; // 0 or 1
  uploaded: number; // 0 or 1
  emailed: number; // 0 or 1
  messaged: number; // 0 or 1
  executed: number; // 0 or 1
  notes?: string | null;
  state_id: number;
  orientation: string;
  disk_space?: number | null;
  scheme: string;
  locked: number; // 0 or 1
  tags?: Array<{ id: number; name: string }> | null;
}

// ============================================
// Daemon Types
// ============================================

export interface DaemonStatus {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  pid?: number;
}

export interface SystemStatus {
  load: number[];
  disk_usage: DiskUsage[];
  memory: MemoryStatus;
  uptime: number;
  version: string;
}

export interface DiskUsage {
  path: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface MemoryStatus {
  total: number;
  used: number;
  free: number;
  percent: number;
}

// ============================================
// Live Streaming Types
// ============================================

export interface StartLiveRequest {
  enable_hls?: boolean;
  enable_webrtc?: boolean;
  enable_mse?: boolean;
}

export interface StartLiveResponse {
  monitor_id: number;
  status: string;
  hls_playlist?: string;
  webrtc_signaling?: string;
  mse_websocket?: string;
}

export interface LiveStats {
  monitor_id: number;
  status: string;
  packets_processed: number;
  errors: number;
  uptime_seconds: number;
  protocols: {
    hls: boolean;
    webrtc: boolean;
    mse: boolean;
  };
}

// ============================================
// Streaming Protocol Types
// ============================================

export type StreamProtocol = 'webrtc' | 'hls';

export type GridLayout = '1x1' | '2x2' | '3x3' | '4x4';

export type StreamConnectionState = 'idle' | 'connecting' | 'signaling' | 'connected' | 'failed';

// ============================================
// WebRTC Signaling Types
// ============================================

export interface WebRtcOffer {
  type: 'offer';
  session_id: string;
  sdp: string;
}

export interface WebRtcAnswer {
  type: 'answer';
  session_id: string;
  sdp: string;
}

export interface WebRtcIceCandidate {
  type: 'icecandidate';
  session_id: string;
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
}

export interface WebRtcReady {
  type: 'ready';
  session_id: string;
  monitor_id: number;
}

export interface WebRtcPing {
  type: 'ping';
}

export interface WebRtcPong {
  type: 'pong';
}

export interface WebRtcError {
  type: 'error';
  message: string;
}

export type WebRtcSignalMessage =
  | WebRtcOffer
  | WebRtcAnswer
  | WebRtcIceCandidate
  | WebRtcReady
  | WebRtcPing
  | WebRtcPong
  | WebRtcError;

// ============================================
// Pagination Types
// ============================================

export interface PaginationParams {
  page?: number;
  page_size?: number;
  [key: string]: string | number | undefined;
}

// Paginated response structure from zm_api
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  current_page: number;
  per_page: number;
  last_page: number;
}

// ============================================
// Helper functions for type conversion
// ============================================

// Convert API integer (0/1) to boolean
export function toBool(value: number | undefined | null): boolean {
  return value === 1;
}


// ============================================
// Config Types
// ============================================

export interface ZmConfig {
  id: number;
  name: string;
  value: string;
  type: string;
  category: string;
  readonly: number;
  private: number;
  system: number;
  default_value?: string | null;
  help?: string | null;
  hint?: string | null;
  prompt?: string | null;
}

// ============================================
// Storage Types
// ============================================

export interface ZmStorage {
  id: number;
  name: string;
  path: string;
  type: string;
  enabled: number;
}

// ============================================
// User Types
// ============================================

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  enabled: number;
  system: string;
  stream: string;
  events: string;
  control: string;
  monitors: string;
  groups: string;
  devices: string;
  snapshots: string;
}

// Orientation values from API
export type Orientation = 'Rotate0' | 'Rotate90' | 'Rotate180' | 'Rotate270' | 'FlipHori' | 'FlipVert';

// Get CSS transform for a monitor/event orientation.
// API returns UPPERCASE_UNDERSCORE format (ROTATE_90, FLIP_HORI, etc.).
// For 90°/270° rotation the video is scaled to fit within its 16:9 container
// (scale factor = 9/16 ≈ 0.5625) so the rotated content is fully visible
// with pillarboxing rather than being clipped.
export function getOrientationStyle(orientation?: string | null): React.CSSProperties | undefined {
  if (!orientation) return undefined;
  // Normalize: strip underscores/spaces and lowercase for matching
  const norm = orientation.replace(/[_\s]/g, '').toLowerCase();
  switch (norm) {
    case 'rotate90':
      return { transform: 'rotate(90deg) scale(0.5625)', transformOrigin: 'center center' };
    case 'rotate180':
      return { transform: 'rotate(180deg)' };
    case 'rotate270':
      return { transform: 'rotate(270deg) scale(0.5625)', transformOrigin: 'center center' };
    case 'fliphori':
    case 'fliphorizontal':
      return { transform: 'scaleX(-1)' };
    case 'flipvert':
    case 'flipvertical':
      return { transform: 'scaleY(-1)' };
    default:
      return undefined;
  }
}
