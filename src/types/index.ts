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

export type MonitorFunction =
  | 'None'
  | 'Monitor'
  | 'Modect'
  | 'Record'
  | 'Mocord'
  | 'Nodect';

export type MonitorStatus =
  | 'Unknown'
  | 'NotRunning'
  | 'Running'
  | 'Connected'
  | 'Signal';

export interface Monitor {
  id: number;
  name: string;
  server_id?: number;
  storage_id?: number;
  manufacturer_id?: number;
  model_id?: number;
  type: string;
  function: MonitorFunction;
  enabled: boolean;
  decoding_enabled: boolean;
  linked_monitors?: string;
  triggers?: string;
  device?: string;
  channel?: number;
  format?: string;
  v4l_multi_buffer?: boolean;
  v4l_captures_per_frame?: number;
  protocol?: string;
  method?: string;
  host?: string;
  port?: string;
  sub_path?: string;
  path?: string;
  second_path?: string;
  options?: string;
  user?: string;
  pass?: string;
  width: number;
  height: number;
  colours: number;
  palette?: number;
  orientation?: string;
  deinterlacing?: number;
  decoder_hwaccel_name?: string;
  decoder_hwaccel_device?: string;
  rtsp_describe?: boolean;
  brightness?: number;
  contrast?: number;
  hue?: number;
  colour?: number;
  event_prefix?: string;
  label_format?: string;
  label_x?: number;
  label_y?: number;
  label_size?: number;
  image_buffer_count?: number;
  max_image_buffer_count?: number;
  warmup_count?: number;
  pre_event_count?: number;
  post_event_count?: number;
  stream_replay_buffer?: number;
  alarm_frame_count?: number;
  section_length?: number;
  min_section_length?: number;
  frame_skip?: number;
  motion_frame_skip?: number;
  analysis_fps_limit?: number;
  analysis_update_delay?: number;
  max_fps?: number;
  alarm_max_fps?: number;
  fps_report_interval?: number;
  ref_blend_perc?: number;
  alarm_ref_blend_perc?: number;
  capture_method?: string;
  capture_width?: number;
  capture_height?: number;
  capture_delay?: number;
  alarm_capture_delay?: number;
  web_colour?: string;
  importance?: string;
  created_at?: string;
  updated_at?: string;
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
  storage_id?: number;
  secondary_storage_id?: number;
  name: string;
  cause: string;
  start_datetime: string;
  end_datetime?: string;
  width: number;
  height: number;
  length?: number;
  frames?: number;
  alarm_frames?: number;
  default_video?: string;
  save_jpegs?: number;
  tot_score?: number;
  avg_score?: number;
  max_score?: number;
  archived?: boolean;
  videoed?: boolean;
  uploaded?: boolean;
  emailed?: boolean;
  messaged?: boolean;
  executed?: boolean;
  notes?: string;
  state_id?: number;
  orientation?: string;
  disk_space?: number;
  scheme?: string;
  locked?: boolean;
  created_at?: string;
  updated_at?: string;
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
// Pagination Types
// ============================================

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
