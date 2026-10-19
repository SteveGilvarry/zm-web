import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Report {
  id: number;
  name?: string | null;
  start_date_time?: string | null;
  end_date_time?: string | null;
  filter_id?: number | null;
  /** Reporting cadence in seconds (legacy default 86400), or null for one-off. */
  interval?: number | null;
}

export async function listReports(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Report>> {
  return apiGet<PaginatedResponse<Report>>(
    '/reports',
    params as Record<string, string | number | undefined>,
  );
}

export async function getReport(id: number): Promise<Report> {
  return apiGet<Report>(`/reports/${id}`);
}

export interface CreateReportPayload {
  name?: string | null;
  start_date_time: string;
  end_date_time: string;
  filter_id?: number | null;
  interval?: number | null;
}

export async function createReport(payload: CreateReportPayload): Promise<Report> {
  return apiPost<CreateReportPayload, Report>('/reports', payload);
}

export async function updateReport(
  id: number,
  payload: Partial<CreateReportPayload>,
): Promise<Report> {
  return apiPatch<Partial<CreateReportPayload>, Report>(`/reports/${id}`, payload);
}

/**
 * `GET /reports/event-audit`: per monitor over a window, how many events,
 * the first and last, the smallest and largest gap between them, and which
 * events have no file on disk or an empty one. Legacy has no page for it;
 * the modern Audit page uses it for the gap and missing-media columns.
 */
export interface MonitorEventAudit {
  monitor_id: number;
  event_count: number;
  first_event_id: number;
  last_event_id: number;
  first_start?: string | null;
  last_end?: string | null;
  min_gap_seconds?: number | null;
  max_gap_seconds?: number | null;
  /** Events whose video (or, without one, whose directory) isn't on disk. */
  missing_files: number[];
  /** Events whose video file is empty. */
  zero_size: number[];
}

export interface EventAuditResponse {
  start: string;
  end: string;
  monitors: MonitorEventAudit[];
}

export async function getEventAudit(params?: { start?: string; end?: string; monitor_id?: number }): Promise<EventAuditResponse> {
  return apiGet<EventAuditResponse>('/reports/event-audit', params);
}

export async function deleteReport(id: number): Promise<void> {
  return apiDelete(`/reports/${id}`);
}
