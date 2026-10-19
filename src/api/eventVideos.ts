import { apiGet, apiPost, apiPostBlob, apiDelete } from './client';
import { API_BASE } from '@/api/base';

/**
 * An event's video files (zm-api#187): the recording itself plus anything
 * `zmvideo.pl` generated from the frames — legacy's Download Video modal
 * (`modals/download.php`) lists these, offers Generate, and links the result.
 */
export interface EventVideo {
  /** File name in the event's directory. */
  name: string;
  /** The file's extension. */
  format: string;
  size_bytes: number;
  /** The event's own recording (`DefaultVideo`); it can't be deleted here. */
  recorded: boolean;
  /** From a generated file's name (zmvideo.pl's -r / -R / -s / -S). */
  rate?: number | null;
  fps?: number | null;
  scale?: number | null;
  size?: string | null;
}

export interface GenerateVideoRequest {
  /** One of `ZM_FFMPEG_FORMATS`; defaults to its starred entry. */
  format?: string | null;
  /** Playback speed relative to real time; exclusive with `fps`. */
  rate?: number | null;
  /** A fixed output frame rate; exclusive with `rate`. */
  fps?: number | null;
  /** Scale relative to the event's size; exclusive with `size`. */
  scale?: number | null;
  /** An exact `WIDTHxHEIGHT`; exclusive with `scale`. */
  size?: string | null;
  transform?: 'none' | 'greyscale';
  /** Replace a file of the same name; otherwise the existing one is the result. */
  overwrite?: boolean;
}

export async function listEventVideos(eventId: number): Promise<EventVideo[]> {
  return apiGet<EventVideo[]>(`/events/${eventId}/videos`);
}

/** Queue the job; the file turns up in `listEventVideos` when it is done. */
export async function generateEventVideo(eventId: number, req: GenerateVideoRequest = {}): Promise<void> {
  await apiPost<GenerateVideoRequest, unknown>(`/events/${eventId}/videos`, req);
}

export async function deleteEventVideo(eventId: number, name: string): Promise<void> {
  return apiDelete(`/events/${eventId}/videos/${encodeURIComponent(name)}`);
}

/** Download link for one file; the token rides in the query like the recording's does. */
export function getEventVideoFileUrl(eventId: number, name: string, token?: string | null): string {
  const base = `${API_BASE}/events/${eventId}/videos/${encodeURIComponent(name)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

/* ------------------------------------------------------------------------ */
/*  Export                                                                  */
/* ------------------------------------------------------------------------ */

/** The parts of legacy's `?view=export` form (`export.php`). */
export type ExportPart = 'details' | 'frames' | 'images' | 'video' | 'misc';

export interface EventExportRequest {
  /** At most 500. */
  ids: number[];
  /** Defaults to `details` and `video`. */
  include?: ExportPart[] | null;
}

/** Build the archive server-side (zm-api#30) and hand back the zip. */
export async function exportEvents(req: EventExportRequest): Promise<{ blob: Blob; filename: string | null }> {
  return apiPostBlob<EventExportRequest>('/events/export', req);
}

/* ------------------------------------------------------------------------ */
/*  Media jobs                                                              */
/* ------------------------------------------------------------------------ */

/** `MediaJobResponse`: a queued or finished `video` job. */
export interface MediaJob {
  id: number;
  /** `video` for now. */
  kind: string;
  event_id: number;
  monitor_id: number;
  /** `queued`, `running`, `done`, `failed` or `cancelled`. */
  status: string;
  params: Record<string, unknown>;
  /** For a video, the file name in the event's directory. */
  output?: string | null;
  error?: string | null;
  created_by?: number | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export async function listMediaJobs(params?: { event_id?: number; status?: string }): Promise<MediaJob[]> {
  return apiGet<MediaJob[]>('/jobs', params);
}

export async function getMediaJob(id: number): Promise<MediaJob> {
  return apiGet<MediaJob>(`/jobs/${id}`);
}

/** Cancel a queued job or remove a finished one. */
export async function deleteMediaJob(id: number): Promise<void> {
  return apiDelete(`/jobs/${id}`);
}
