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
  /** Space-separated "x,y" pairs — the polygon's vertex list, in pixels. */
  coords: string;
  num_coords: number;

  /* Motion-detection settings. `ZoneResponse` marks the four below as
   * required, so they are typed as such — a zm-api older than the
   * zone-detail work (zm-api#22) omits them and this typing would lie.
   * Create/UpdateZoneRequest accept all of them (see `ZoneSettingsPayload`). */
  /** ZoneMinder's stored `Zones.Area` — square pixels, recomputed on save. */
  area: number;
  check_method: string;
  min_pixel_threshold?: number | null;
  max_pixel_threshold?: number | null;
  min_alarm_pixels?: number | null;
  max_alarm_pixels?: number | null;
  filter_x?: number | null;
  filter_y?: number | null;
  min_filter_pixels?: number | null;
  max_filter_pixels?: number | null;
  min_blob_pixels?: number | null;
  max_blob_pixels?: number | null;
  min_blobs?: number | null;
  max_blobs?: number | null;
  overload_frames: number;
  extend_alarm_frames: number;
  /** Packed RGB of the zone's alarm colour. */
  alarm_rgb?: number | null;
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

/**
 * The motion-detection half of Create/UpdateZoneRequest — legacy's zone
 * settings table (`views/zone.php:288-340`), field for field.
 *
 * Every one is nullable: legacy stores a blank box as NULL/0 rather than
 * keeping the old number, and `null` is how the request schema clears a
 * column. The alarm/filter/blob areas are `double` because a `Percent` zone
 * holds fractions of a percent there.
 */
export interface ZoneSettingsPayload {
  check_method?: string | null;
  min_pixel_threshold?: number | null;
  max_pixel_threshold?: number | null;
  min_alarm_pixels?: number | null;
  max_alarm_pixels?: number | null;
  filter_x?: number | null;
  filter_y?: number | null;
  min_filter_pixels?: number | null;
  max_filter_pixels?: number | null;
  min_blob_pixels?: number | null;
  max_blob_pixels?: number | null;
  min_blobs?: number | null;
  max_blobs?: number | null;
  /** Packed `(R << 16) | (G << 8) | B`, as `Zones.AlarmRGB` stores it. */
  alarm_rgb?: number | null;
  overload_frames?: number | null;
  extend_alarm_frames?: number | null;
}

export interface CreateZonePayload extends ZoneSettingsPayload {
  name: string;
  type: string;
  units: string;
  coords: string;
  num_coords: number;
}

export async function createZone(
  monitorId: number,
  payload: CreateZonePayload,
): Promise<Zone> {
  return apiPost<CreateZonePayload, Zone>(`/monitors/${monitorId}/zones`, payload);
}

export interface UpdateZonePayload extends ZoneSettingsPayload {
  name?: string;
  type?: string;
  units?: string;
  /** New polygon. `num_coords` and `area` are recomputed from it server-side. */
  coords?: string;
}

/**
 * `PUT /zones/{id}` is a partial update: a field left out stays as it is, and
 * an explicit `null` clears a nullable column.
 */
export async function updateZone(id: number, payload: UpdateZonePayload): Promise<Zone> {
  return apiPut<UpdateZonePayload, Zone>(`/zones/${id}`, payload);
}

export async function deleteZone(id: number): Promise<void> {
  return apiDelete(`/zones/${id}`);
}

/* ------------------------------------------------------------------------ */
/*  Zone presets                                                            */
/* ------------------------------------------------------------------------ */

export interface ZonePreset {
  id: number;
  name: string;
  type: string;
  units: string;
  check_method: string;
}

export async function listZonePresets(): Promise<PaginatedResponse<ZonePreset>> {
  return apiGet<PaginatedResponse<ZonePreset>>('/zone-presets', {
    page: 1, page_size: 100,
  });
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
