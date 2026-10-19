import { listEventVideos, type EventVideo, type ExportPart, type GenerateVideoRequest } from '@/api/eventVideos';
import { formatBytes, humanFilesize } from '@/lib/format';

/**
 * Shared logic behind the three media dialogs: Export (legacy
 * `?view=export`), Download Video (`modals/download.php`) and Generate Video
 * (`?view=video`). Pure helpers here; the dialogs render them.
 */

export type MediaDialogVariant = 'modern' | 'classic';

/** Sizes as each skin prints them: legacy's `human_filesize` or the house style. */
export function mediaSize(variant: MediaDialogVariant, bytes: number | null | undefined): string {
  return variant === 'classic' ? humanFilesize(bytes ?? 0) : formatBytes(bytes ?? 0);
}

/** zm-api builds one archive from at most this many events (zm-api#30). */
export const EXPORT_MAX_EVENTS = 500;

/** Keep the first `EXPORT_MAX_EVENTS` ids and say how many there were. */
export function capExportIds(ids: readonly number[]): { ids: number[]; total: number; capped: boolean } {
  return {
    ids: ids.slice(0, EXPORT_MAX_EVENTS),
    total: ids.length,
    capped: ids.length > EXPORT_MAX_EVENTS,
  };
}

/** The part checkboxes, in legacy's order (`export.php`). */
export const EXPORT_PART_KEYS: readonly ExportPart[] = ['details', 'frames', 'images', 'video', 'misc'];

/**
 * Hand a blob to the browser as a download under `filename`. The object URL
 * is released on the next tick, after the click has started the save.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * `ZM_FFMPEG_FORMATS` as legacy's video view reads it (`video.php`): space
 * separated, a trailing `*` marks the default and `**` the one for live
 * streams. The first single-starred entry is the default.
 */
export function parseFfmpegFormats(raw: string): { formats: string[]; defaultFormat: string } {
  const formats: string[] = [];
  let defaultFormat = '';
  for (const word of raw.split(/\s+/).filter(Boolean)) {
    const m = /^([^*]+)(\*\*?)$/.exec(word);
    const name = m ? m[1] : word;
    if (!formats.includes(name)) formats.push(name);
    if (m && m[2] === '*' && !defaultFormat) defaultFormat = name;
  }
  return { formats, defaultFormat: defaultFormat || formats[0] || '' };
}

/**
 * Legacy's `$rates` (`skins/classic/includes/config.php`) from 1/4x up.
 * The reverse and Stop entries make no sense for a file and zmvideo.pl
 * rejects them, so they are left out.
 */
export const VIDEO_RATES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.25, label: '1/4x' },
  { value: 0.5, label: '1/2x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
  { value: 16, label: '16x' },
];

/** Legacy's `$scales` that mean something for a file: Actual and the Max NNNpx caps. */
export const VIDEO_MAX_WIDTHS: readonly number[] = [480, 640, 800, 1024, 1280, 1600];

/**
 * What a Video Size choice asks zm-api for. `actual` is scale 1; `maxNNN`
 * fits the event's width to NNN pixels, keeping its aspect (even height,
 * which the encoders want), or stays at scale 1 when the event is already
 * narrower.
 */
export function videoSizeRequest(choice: string, width: number, height: number): Pick<GenerateVideoRequest, 'scale' | 'size'> {
  const m = /^max(\d+)$/.exec(choice);
  if (!m || !width || !height) return { scale: 1 };
  const max = Number(m[1]);
  if (width <= max) return { scale: 1 };
  const h = Math.max(2, Math.round((height * max) / width / 2) * 2);
  return { size: `${max}x${h}` };
}

/** The Rate column of legacy's file table. */
export function videoRateText(v: EventVideo): string {
  if (v.fps != null) return `${v.fps}fps`;
  if (v.rate == null) return '';
  return VIDEO_RATES.find((r) => r.value === v.rate)?.label ?? `${v.rate}x`;
}

/** The Scale column of legacy's file table. `actual` is the caller's word for scale 1. */
export function videoScaleText(v: EventVideo, actual: string): string {
  if (v.size) return v.size;
  if (v.scale == null) return '';
  return v.scale === 1 ? actual : `${v.scale}x`;
}

const fileKey = (v: EventVideo) => `${v.name}:${v.size_bytes}`;

/**
 * After Generate: the job runs in the background and `/jobs` cannot be read
 * on the current build (zm-api#191), so poll the event's file list until a
 * generated file turns up that was not there before (a new name, or a new
 * size for an overwritten one). Gives up after `tries` and returns null.
 */
export async function waitForGeneratedVideo(
  eventId: number,
  before: readonly EventVideo[],
  opts: { intervalMs?: number; tries?: number; sleep?: (ms: number) => Promise<void>; isCancelled?: () => boolean } = {},
): Promise<EventVideo | null> {
  const { intervalMs = 3000, tries = 40 } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const seen = new Set(before.map(fileKey));
  // ffmpeg writes straight to the final name, so a file is only done once
  // its size holds still between two polls.
  const growing = new Map<string, number>();
  for (let i = 0; i < tries; i++) {
    await sleep(intervalMs);
    if (opts.isCancelled?.()) return null;
    const now = await listEventVideos(eventId);
    for (const v of now) {
      if (v.recorded || v.size_bytes <= 0 || seen.has(fileKey(v))) continue;
      if (growing.get(v.name) === v.size_bytes) return v;
      growing.set(v.name, v.size_bytes);
    }
  }
  return null;
}
