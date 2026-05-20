import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export type ZoneType =
  | 'Active'
  | 'Inclusive'
  | 'Exclusive'
  | 'Preclusive'
  | 'Inactive'
  | 'Privacy';

export interface Zone {
  id: number;
  monitor_id: number;
  name: string;
  type: ZoneType | string;
  units: 'Pixels' | 'Percent' | string;
  /** Space-separated "x,y" pairs — the polygon's vertex list. */
  coords: string;
  num_coords: number;
}

export async function listZonesForMonitor(
  monitorId: number,
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Zone>> {
  return apiGet<PaginatedResponse<Zone>>(
    `/monitors/${monitorId}/zones`,
    params as Record<string, string | number | undefined>,
  );
}

export interface CreateZonePayload {
  name: string;
  type: string;
  units: string;
  coords: string;
  num_coords: number;
  check_method?: string;
}

export async function createZone(
  monitorId: number,
  payload: CreateZonePayload,
): Promise<Zone> {
  return apiPost<CreateZonePayload, Zone>(`/monitors/${monitorId}/zones`, payload);
}

export async function updateZone(
  id: number,
  payload: { name?: string; polygon?: string },
): Promise<Zone> {
  return apiPut<typeof payload, Zone>(`/zones/${id}`, payload);
}

export async function deleteZone(id: number): Promise<void> {
  return apiDelete(`/zones/${id}`);
}

/* ------------------------------------------------------------------------ */
/*  Polygon utilities                                                       */
/* ------------------------------------------------------------------------ */

export interface Point {
  x: number;
  y: number;
}

/** Parse the backend "x1,y1 x2,y2 …" coords format into an array of points. */
export function parseCoords(coords: string): Point[] {
  if (!coords) return [];
  return coords
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [xs, ys] = pair.split(',');
      return { x: Number(xs), y: Number(ys) };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** Serialise an array of points back to the backend format. */
export function serializeCoords(points: Point[]): string {
  return points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
}

/** Insert a new vertex between i and i+1 at the midpoint of that edge. */
export function insertMidpoint(points: Point[], i: number): Point[] {
  const a = points[i];
  const b = points[(i + 1) % points.length];
  if (!a || !b) return points;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return [...points.slice(0, i + 1), mid, ...points.slice(i + 1)];
}
