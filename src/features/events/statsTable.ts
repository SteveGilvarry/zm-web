import type { Frame } from '@/api/frames';
import type { Stat } from '@/api/stats';
import { parseCoords, type Zone } from '@/api/zones';

/**
 * The stats table of legacy `?view=stats` and the frames page's "+" row
 * (`getStatsTableHTML`, `skins/classic/includes/functions.php:1738`).
 *
 * Stats rows hold absolute pixel counts; legacy prints each next to its share
 * of the zone. Since 1.39.2 `Zones.Area` is in percent space — the shoelace
 * area of coordinates on a 100×100 frame, so 10000 is the whole picture — and
 * 1.39.41 turns it back into pixels before dividing (commit 2874751c7):
 *
 *     $pixelArea = $stat['Area'] / 10000.0 * $stat['Width'] * $stat['Height'];
 *     if ($pixelArea <= 0) $pixelArea = 1;
 *
 * A zone still stored in pixels (written before the migration, or by a tool
 * that skipped it) already has its area in pixels; dividing that by 10000
 * again would print percentages in the thousands. Such a zone is recognised
 * by a coordinate outside 0–100, and its area is used as it is.
 */
export function zonePixelArea(
  zone: Pick<Zone, 'area' | 'coords'> | undefined,
  width: number,
  height: number,
): number {
  if (!zone) return 1;
  const points = parseCoords(zone.coords);
  const percentSpace = points.length > 0
    && points.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
  const area = percentSpace ? (zone.area / 10000) * width * height : zone.area;
  return area > 0 ? area : 1;
}

/**
 * `sprintf('%d (%d%%)', n, 100 * n / area)`. PHP's `%d` truncates toward
 * zero, so 6.51 % prints as 6 %, not 7. The frame view's stats use `%.1f`
 * instead (`ajax/stats.php` with `raw`), which is what `decimals` is for.
 */
export function pixelsWithShare(n: number, pixelArea: number, decimals = 0): string {
  return `${n} (${share(n, pixelArea, decimals)}%)`;
}

function share(n: number, pixelArea: number, decimals: number): string {
  const pct = (100 * n) / pixelArea;
  return decimals > 0 ? pct.toFixed(decimals) : String(Math.trunc(pct));
}

/** One row of the stats table, every cell already formatted as legacy prints it. */
export interface StatsRow {
  id: number;
  zoneId: number;
  zoneName: string;
  eventId: number;
  frameId: number;
  pixelDiff: number;
  alarmPx: string;
  filterPx: string;
  blobPx: string;
  blobs: number;
  /** `min-max (a%-b%)` with more than one blob, else `min (a%)`. */
  blobSizes: string;
  /** `MinX,MinY-MaxX,MaxY`. */
  alarmLimits: string;
  score: number;
}

export function formatStat(
  stat: Stat,
  zone: Pick<Zone, 'name' | 'area' | 'coords'> | undefined,
  width: number,
  height: number,
  decimals = 0,
): StatsRow {
  const area = zonePixelArea(zone, width, height);
  const blobSizes = stat.blobs > 1
    ? `${stat.min_blob_size}-${stat.max_blob_size} (${share(stat.min_blob_size, area, decimals)}%-${share(stat.max_blob_size, area, decimals)}%)`
    : pixelsWithShare(stat.min_blob_size, area, decimals);
  return {
    id: stat.id,
    zoneId: stat.zone_id,
    // A zone deleted since the event leaves its stats behind; legacy's LEFT
    // JOIN prints an empty name for it.
    zoneName: zone?.name ?? '',
    eventId: stat.event_id,
    frameId: stat.frame_id,
    pixelDiff: stat.pixel_diff,
    alarmPx: pixelsWithShare(stat.alarm_pixels, area, decimals),
    filterPx: pixelsWithShare(stat.filter_pixels, area, decimals),
    blobPx: pixelsWithShare(stat.blob_pixels, area, decimals),
    blobs: stat.blobs,
    blobSizes,
    alarmLimits: `${stat.min_x},${stat.min_y}-${stat.max_x},${stat.max_y}`,
    score: stat.score,
  };
}

/** Legacy orders the rows `ORDER BY S.ZoneId`. */
export function formatStats(
  stats: Stat[],
  zones: Array<Pick<Zone, 'id' | 'name' | 'area' | 'coords'>>,
  width: number,
  height: number,
  decimals = 0,
): StatsRow[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  return [...stats]
    .sort((a, b) => a.zone_id - b.zone_id || a.id - b.id)
    .map((s) => formatStat(s, byId.get(s.zone_id), width, height, decimals));
}

/**
 * The frame legacy opens for `fid=0` — `SELECT * FROM Frames WHERE EventId=?
 * AND Score=<MaxScore>`, the first such row. zm-api#176 will hand the id over
 * directly; until then it is picked from `/frames`.
 */
export function maxScoreFrame(frames: Frame[]): Frame | null {
  let best: Frame | null = null;
  for (const f of frames) {
    if (!best || f.score > best.score || (f.score === best.score && f.frame_id < best.frame_id)) {
      best = f;
    }
  }
  return best;
}

/** First / Prev / Next / Last for one frame of an event (`views/frame.php:39–44`). */
export interface FrameNeighbours {
  first: number;
  prev: number | null;
  next: number | null;
  last: number | null;
  /** First and Prev are live past frame 1. */
  canBack: boolean;
  /** Next and Last are live short of the event's last frame. */
  canForward: boolean;
}

export function frameNeighbours(frames: Frame[], frameId: number, eventFrames?: number): FrameNeighbours {
  let prev: number | null = null;
  let next: number | null = null;
  let last: number | null = null;
  for (const f of frames) {
    if (f.frame_id < frameId && (prev == null || f.frame_id > prev)) prev = f.frame_id;
    if (f.frame_id > frameId && (next == null || f.frame_id < next)) next = f.frame_id;
    if (last == null || f.frame_id > last) last = f.frame_id;
  }
  // `$maxFid = $Event->Frames()`, capped by the last frame actually stored.
  const maxFid = Math.min(eventFrames && eventFrames > 0 ? eventFrames : Infinity, last ?? 0);
  return {
    first: 1,
    prev,
    next,
    last,
    canBack: frameId > 1,
    canForward: frameId < maxFid,
  };
}

/** The stats table's columns, in legacy's order (`getStatsTableHTML`). */
export const STATS_COLUMNS = [
  'zoneName', 'pixelDiff', 'alarmPx', 'filterPx', 'blobPx', 'blobs', 'blobSizes', 'alarmLimits', 'score',
] as const satisfies readonly (keyof StatsRow)[];

export type StatsColumnKey = (typeof STATS_COLUMNS)[number];
