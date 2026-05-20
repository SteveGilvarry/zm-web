import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Report {
  id: number;
  name?: string | null;
  start_date_time?: string | null;
  end_date_time?: string | null;
  filter_id?: number | null;
  /** Reporting cadence in minutes, or null for one-off. */
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

export async function deleteReport(id: number): Promise<void> {
  return apiDelete(`/reports/${id}`);
}
