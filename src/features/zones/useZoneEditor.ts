import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  listZonesForMonitor, createZone, updateZone, deleteZone, listZonePresets,
  serializeCoords,
  type Point, type Zone, type ZonePreset, type ZoneSettingsPayload,
} from '@/api/zones';
import { useToast } from '@/components/common/toastStore';
import { coordsArePercent, coordsToPixels, polygonArea } from './zoneArea';
import { isSelfIntersecting } from './selfIntersects';
import { zoneFieldEnabled, type ZoneFieldEnabled, type ZoneSettingField } from './zoneSettings';
import { clampUnsignedByte, validateZoneForm, type ZoneFormValues } from './zoneValidation';

/** The zone the editor has open: an id, a not-yet-created zone, or nothing. */
export type ZoneSelection = number | 'new' | null;

/** Every motion setting except the two that are not plain numbers. */
export type ZoneNumField = Exclude<ZoneSettingField, 'check_method' | 'alarm_rgb'>;

export const ZONE_NUM_FIELDS: readonly ZoneNumField[] = [
  'min_pixel_threshold', 'max_pixel_threshold',
  'min_alarm_pixels', 'max_alarm_pixels',
  'filter_x', 'filter_y',
  'min_filter_pixels', 'max_filter_pixels',
  'min_blob_pixels', 'max_blob_pixels',
  'min_blobs', 'max_blobs',
  'overload_frames', 'extend_alarm_frames',
];

/**
 * The six area thresholds legacy shows as a percentage of the zone with a
 * mirrored pixel box beside it (`zone.php:310-323`).
 */
export const ZONE_AREA_FIELDS = [
  'min_alarm_pixels', 'max_alarm_pixels',
  'min_filter_pixels', 'max_filter_pixels',
  'min_blob_pixels', 'max_blob_pixels',
] as const satisfies readonly ZoneNumField[];

export type ZoneAreaField = (typeof ZONE_AREA_FIELDS)[number];

/** Form state, so a half-typed or deliberately empty box stays empty. */
export type ZoneNums = Record<ZoneNumField, string>;

export const CHECK_METHODS = ['AlarmedPixels', 'FilteredPixels', 'Blobs'] as const;

export type AlarmChannel = 'r' | 'g' | 'b';

/**
 * What the form edits. The polygon is in capture pixels and so are the six
 * area thresholds: this editor saves integer coordinates, and for those the
 * daemon reads the thresholds as pixel counts whatever `Units` says
 * (`zm_zone.cpp:1060-1076`). The percentage boxes are derived from them.
 */
export interface ZoneDraft {
  id: number | null;
  name: string;
  type: string;
  points: Point[];
  checkMethod: string;
  /** Legacy's three 0–255 boxes, kept as typed so an empty one shows. */
  alarm: Record<AlarmChannel, string>;
  nums: ZoneNums;
}

export interface ZoneFrame {
  width: number;
  height: number;
}

function numString(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '' : String(v);
}

export function emptyNums(): ZoneNums {
  return Object.fromEntries(ZONE_NUM_FIELDS.map((f) => [f, ''])) as ZoneNums;
}

/** Packed `(R << 16) | (G << 8) | B`, as `Zones.AlarmRGB` holds it. */
export function alarmFromPacked(rgb: number | null | undefined): Record<AlarmChannel, string> {
  // Legacy prints `($zone['AlarmRGB']>>16)&0xff` etc., so a NULL column
  // shows as 0 / 0 / 0 rather than three empty boxes.
  const v = rgb == null || !Number.isFinite(rgb) ? 0 : Math.floor(rgb) & 0xffffff;
  return { r: String((v >> 16) & 0xff), g: String((v >> 8) & 0xff), b: String(v & 0xff) };
}

export function alarmToPacked(alarm: Record<AlarmChannel, string>): number {
  const c = (s: string) => Math.min(255, Math.max(0, parseInt(s, 10) || 0));
  return (c(alarm.r) << 16) | (c(alarm.g) << 8) | c(alarm.b);
}

export function alarmToHex(alarm: Record<AlarmChannel, string>): string {
  return `#${alarmToPacked(alarm).toString(16).padStart(6, '0')}`;
}

/** The draft polygon's area in square capture pixels. */
export function draftAreaPx(points: Point[]): number {
  return Math.round(polygonArea(points));
}

/**
 * A stored zone as the form edits it. A zone legacy 1.39.41 saved holds
 * percent coords and percent-of-zone thresholds; both come in as pixels
 * here, because that is how this editor will save them. Legacy's own rule
 * for a percent zone applies: a threshold above 100 is a pixel count that
 * was never converted (`zone.php:112-122`).
 */
export function draftFromZone(z: Zone, frame: ZoneFrame): ZoneDraft {
  const points = coordsToPixels(z.coords, frame);
  const nums = Object.fromEntries(ZONE_NUM_FIELDS.map((f) => [f, numString(z[f])])) as ZoneNums;
  if (coordsArePercent(z.coords)) {
    const zonePx = draftAreaPx(points);
    for (const f of ZONE_AREA_FIELDS) {
      const v = z[f];
      if (v != null && Number.isFinite(v) && v <= 100) nums[f] = String(Math.round((v * zonePx) / 100));
    }
  }
  return {
    id: z.id,
    name: z.name,
    type: z.type,
    points,
    checkMethod: z.check_method || 'AlarmedPixels',
    alarm: alarmFromPacked(z.alarm_rgb),
    nums,
  };
}

/**
 * Legacy's new zone (`zone.php:66-91`): the whole frame, named "New", Blobs,
 * red, every threshold blank — so `validateForm` sends the operator to a
 * preset or the object-size tool before it will save.
 */
export function newZoneDraft(frame: ZoneFrame, name: string): ZoneDraft {
  const maxX = Math.max(0, frame.width - 1);
  const maxY = Math.max(0, frame.height - 1);
  return {
    id: null,
    name,
    type: 'Active',
    points: [{ x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }],
    checkMethod: 'Blobs',
    alarm: { r: '255', g: '0', b: '0' },
    nums: emptyNums(),
  };
}

/**
 * The settings half of the save body. A field the current Type / Check Method
 * disables is left out entirely, so the column keeps its stored value — the
 * same thing legacy gets from not submitting a disabled input. A field that
 * is on but empty goes out as `null`, which clears it.
 */
export function settingsPayload(draft: ZoneDraft, enabled: ZoneFieldEnabled): ZoneSettingsPayload {
  const out: ZoneSettingsPayload = {};
  if (enabled.check_method) out.check_method = draft.checkMethod;
  if (enabled.alarm_rgb) out.alarm_rgb = alarmToPacked(draft.alarm);
  for (const field of ZONE_NUM_FIELDS) {
    if (!enabled[field]) continue;
    const raw = draft.nums[field].trim();
    const n = Number(raw);
    out[field] = raw !== '' && Number.isFinite(n) ? n : null;
  }
  return out;
}

/** The values `validateZoneForm` checks, read off a draft. */
export function formValues(draft: ZoneDraft): ZoneFormValues {
  const n = draft.nums;
  return {
    type: draft.type,
    checkMethod: draft.checkMethod,
    alarmRgb: draft.alarm,
    minPixelThreshold: n.min_pixel_threshold, maxPixelThreshold: n.max_pixel_threshold,
    filterX: n.filter_x, filterY: n.filter_y,
    minAlarmPixels: n.min_alarm_pixels, maxAlarmPixels: n.max_alarm_pixels,
    minFilterPixels: n.min_filter_pixels, maxFilterPixels: n.max_filter_pixels,
    minBlobPixels: n.min_blob_pixels, maxBlobPixels: n.max_blob_pixels,
    minBlobs: n.min_blobs, maxBlobs: n.max_blobs,
    selfIntersecting: isSelfIntersecting(draft.points),
  };
}

/** Two drafts say the same thing — what legacy's `checkDirty` compares. */
export function sameDraft(a: ZoneDraft, b: ZoneDraft): boolean {
  if (a.name !== b.name || a.type !== b.type || a.checkMethod !== b.checkMethod) return false;
  if (a.alarm.r !== b.alarm.r || a.alarm.g !== b.alarm.g || a.alarm.b !== b.alarm.b) return false;
  // Numbers by value, so "100" and "100.0" are not a change (`formState`).
  for (const f of ZONE_NUM_FIELDS) {
    const x = a.nums[f].trim();
    const y = b.nums[f].trim();
    if (x === '' || y === '' ? x !== y : Number(x) !== Number(y)) return false;
  }
  if (a.points.length !== b.points.length) return false;
  return a.points.every((p, i) => Math.round(p.x) === Math.round(b.points[i].x) && Math.round(p.y) === Math.round(b.points[i].y));
}

/** A percentage of the zone, to legacy's two decimals; '' when there is none. */
export function areaPercent(px: string, zonePx: number): string {
  const n = parseFloat(px);
  if (px.trim() === '' || !Number.isFinite(n) || !(zonePx > 0)) return '';
  return String(Math.round((n / zonePx) * 10000) / 100);
}

/**
 * A preset onto the draft — legacy's `applyPreset` (`zone.js:197-226`): the
 * check method and the thirteen thresholds, never the name or the type.
 * zm-api's `ZonePresetResponse` has only the method today; the thresholds
 * are applied whenever a build sends them, converted from the preset's
 * percent-of-zone to this editor's pixels.
 */
export function applyPresetToDraft(draft: ZoneDraft, preset: ZonePreset): ZoneDraft {
  const zonePx = draftAreaPx(draft.points);
  const nums = { ...draft.nums };
  for (const f of ZONE_NUM_FIELDS) {
    const v = preset[f];
    if (v === undefined) continue; // the response did not carry it
    if (v === null) { nums[f] = ''; continue; }
    const isArea = (ZONE_AREA_FIELDS as readonly string[]).includes(f);
    nums[f] = isArea && preset.units === 'Percent' ? String(Math.round((v * zonePx) / 100)) : String(v);
  }
  return { ...draft, checkMethod: preset.check_method || draft.checkMethod, nums };
}

export interface UseZoneEditorArgs {
  monitorId: number;
  width: number;
  height: number;
  /**
   * Zone the parent wants open — a list row, or `'new'` for Add New Zone.
   * Omit to leave the selection to the editor.
   */
  openZoneId?: ZoneSelection;
  /** Fires when the selection changes, so the parent can mirror it. */
  onSelectionChange?: (id: ZoneSelection) => void;
  /**
   * How to tell the operator the capture process restarts after a Privacy
   * zone save. Legacy uses `alert()` (`zone.js:522`); a toast by default.
   */
  notifyPrivacyRestart?: (message: string) => void;
}

export interface ZoneEditorState {
  monitorId: number;
  frame: ZoneFrame;
  zones: Zone[];
  zonesLoading: boolean;
  presets: ZonePreset[];
  selectedId: ZoneSelection;
  select: (id: ZoneSelection) => void;
  startNewZone: () => void;
  /** Cancel: drop the draft and close. */
  cancel: () => void;
  draft: ZoneDraft | null;
  setDraft: (next: ZoneDraft) => void;
  /** Something differs from what was loaded — legacy's Reset enable. */
  dirty: boolean;
  /** Legacy's Reset: back to the zone as it was opened. */
  reset: () => void;
  /** Bumped by every reset, so tools holding their own state can drop it. */
  resetCount: number;
  /** Legacy's Refresh reloads the page: drop the edits and fetch the zone again. */
  refresh: () => void;
  enabled: ZoneFieldEnabled | null;
  /** The draft polygon's area in square pixels (legacy's `areaPixels`). */
  zonePx: number;
  /** …and as a share of the frame (legacy's `areaPercent`). */
  zonePct: number;
  selfIntersecting: boolean;
  setNum: (field: ZoneNumField, value: string) => void;
  /** Type into the % box: the pixel value follows, clamped to 0–100%. */
  setAreaPercent: (field: ZoneAreaField, pct: string) => void;
  /** Type into the px box: clamped to the zone's own area. */
  setAreaPixels: (field: ZoneAreaField, px: string) => void;
  setAlarmChannel: (channel: AlarmChannel, value: string) => void;
  setAlarmHex: (hex: string) => void;
  applyPreset: (presetId: number) => void;
  /** Validation messages from the last Save attempt. */
  errors: string[];
  /** Validate, then create or update. */
  save: () => void;
  saving: boolean;
  remove: () => void;
  removing: boolean;
}

/**
 * The zone editor's state and verbs, shared by both skins' layouts — legacy
 * `?view=zone&mid=&zid=` (`views/zone.php`, `views/js/zone.js`).
 *
 * Edits stay local until Save. Units always go out as `Percent`, the hidden
 * input legacy sends (`zone.php:278`); the polygon goes out as integer
 * pixels, so the thresholds go out as pixel counts.
 */
export function useZoneEditor({
  monitorId, width, height, openZoneId, onSelectionChange, notifyPrivacyRestart,
}: UseZoneEditorArgs): ZoneEditorState {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const frame = useMemo(() => ({ width, height }), [width, height]);

  const zonesQ = useQuery({
    queryKey: ['zones', monitorId],
    queryFn: () => listZonesForMonitor(monitorId, { page: 1, page_size: 100 }),
  });
  const zones: Zone[] = useMemo(() => zonesQ.data?.items ?? [], [zonesQ.data]);

  const presetsQ = useQuery({
    queryKey: ['zonePresets'],
    queryFn: listZonePresets,
    staleTime: 5 * 60_000,
  });
  const presets = presetsQ.data?.items ?? [];

  // Selection is controlled when the parent passes `openZoneId` and owned
  // here otherwise. No effect syncs the two — that only ever fights the parent.
  const controlled = openZoneId !== undefined;
  const [internalId, setInternalId] = useState<ZoneSelection>(null);
  const selectedId: ZoneSelection = controlled ? openZoneId : internalId;

  const select = (id: ZoneSelection) => {
    if (!controlled) setInternalId(id);
    onSelectionChange?.(id);
  };

  // The draft the form starts from, rebuilt whenever the selection moves.
  const baseDraft = useMemo<ZoneDraft | null>(() => {
    if (selectedId == null) return null;
    if (selectedId === 'new') return newZoneDraft(frame, t('New'));
    const z = zones.find((x) => x.id === selectedId);
    return z ? draftFromZone(z, frame) : null; // null while the list is still loading
  }, [selectedId, zones, frame, t]);

  // Unsaved edits, tagged with the zone they belong to. A refetch of the
  // list lands underneath without wiping what the operator typed, and
  // selecting another zone shows that zone's stored values again.
  const [edited, setEdited] = useState<{ for: number | 'new'; draft: ZoneDraft } | null>(null);
  const [errorState, setErrorState] = useState<{ for: ZoneSelection; errors: string[] }>({ for: null, errors: [] });
  const [resetCount, setResetCount] = useState(0);
  const draft = edited && edited.for === selectedId ? edited.draft : baseDraft;
  const setDraft = (next: ZoneDraft) => {
    if (selectedId != null) setEdited({ for: selectedId, draft: next });
  };
  const errors = errorState.for === selectedId ? errorState.errors : [];

  const dirty = !!(draft && baseDraft && !sameDraft(draft, baseDraft));
  const reset = () => {
    setEdited(null);
    setErrorState({ for: null, errors: [] });
    setResetCount((n) => n + 1);
  };

  const cancel = () => {
    setEdited(null);
    setErrorState({ for: null, errors: [] });
    select(null);
  };

  const zonePx = draft ? draftAreaPx(draft.points) : 0;
  const frameArea = width * height;
  const zonePct = frameArea > 0 ? (zonePx / frameArea) * 100 : 0;
  const selfIntersecting = draft ? isSelfIntersecting(draft.points) : false;
  const enabled = draft ? zoneFieldEnabled(draft.type, draft.checkMethod) : null;

  const setNum = (field: ZoneNumField, value: string) => {
    if (!draft) return;
    // Legacy clamps the pixel thresholds to a byte as you type.
    const v = field === 'min_pixel_threshold' || field === 'max_pixel_threshold' ? clampUnsignedByte(value) : value;
    setDraft({ ...draft, nums: { ...draft.nums, [field]: v } });
  };

  const setAreaPercent = (field: ZoneAreaField, pct: string) => {
    if (!draft) return;
    let px = '';
    const n = parseFloat(pct);
    if (pct.trim() !== '' && Number.isFinite(n) && zonePx > 0) {
      px = String(Math.round((Math.min(100, Math.max(0, n)) * zonePx) / 100));
    }
    setDraft({ ...draft, nums: { ...draft.nums, [field]: px } });
  };

  const setAreaPixels = (field: ZoneAreaField, raw: string) => {
    if (!draft) return;
    let px = raw;
    const n = parseInt(raw, 10);
    if (raw.trim() !== '' && Number.isFinite(n)) px = String(Math.max(0, zonePx > 0 ? Math.min(n, zonePx) : n));
    setDraft({ ...draft, nums: { ...draft.nums, [field]: px } });
  };

  const setAlarmChannel = (channel: AlarmChannel, value: string) => {
    if (!draft) return;
    setDraft({ ...draft, alarm: { ...draft.alarm, [channel]: clampUnsignedByte(value) } });
  };

  const setAlarmHex = (hex: string) => {
    if (!draft) return;
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    if (!m) return;
    setDraft({
      ...draft,
      alarm: { r: String(parseInt(m[1], 16)), g: String(parseInt(m[2], 16)), b: String(parseInt(m[3], 16)) },
    });
  };

  const applyPreset = (presetId: number) => {
    const p = presets.find((x) => x.id === presetId);
    if (!p || !draft) return;
    setDraft(applyPresetToDraft(draft, p));
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['zones', monitorId] });
    void qc.invalidateQueries({ queryKey: ['monitor', monitorId] });
  };

  const saveMutation = useMutation({
    mutationFn: async (d: ZoneDraft) => {
      const coords = serializeCoords(d.points);
      const settings = settingsPayload(d, zoneFieldEnabled(d.type, d.checkMethod));
      if (d.id == null) {
        await createZone(monitorId, {
          name: d.name, type: d.type, units: 'Percent',
          coords, num_coords: d.points.length,
          ...settings,
        });
      } else {
        await updateZone(d.id, { name: d.name, type: d.type, units: 'Percent', coords, ...settings });
      }
      // Returned, not read off `draft`: by the time this settles the
      // selection has moved on.
      return d.type;
    },
    onSuccess: (savedType) => {
      // Legacy alerts on every Privacy-zone save (`zone.js:521`): the capture
      // process has to restart before the blackout changes on the stream.
      if (savedType === 'Privacy') {
        const message = t('Capture process for this monitor will be restarted for the Privacy zone changes to take effect.');
        if (notifyPrivacyRestart) notifyPrivacyRestart(message); else toast.info(message);
      }
      invalidate();
      // 1.39.41 returns to the zones list after a save (`actions/zone.php:84-91`).
      cancel();
    },
    onError: toast.apiError,
  });

  const save = () => {
    if (!draft) return;
    const found = validateZoneForm(formValues(draft), t);
    setErrorState({ for: selectedId, errors: found });
    if (found.length) return;
    saveMutation.mutate(draft);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteZone(id),
    onSuccess: () => {
      invalidate();
      cancel();
    },
    onError: toast.apiError,
  });

  const remove = () => {
    if (!draft || draft.id == null) return;
    if (window.confirm(t('Delete zone "{{name}}"?', { name: draft.name }))) deleteMutation.mutate(draft.id);
  };

  return {
    monitorId,
    frame,
    zones,
    zonesLoading: zonesQ.isLoading,
    presets,
    selectedId,
    select,
    startNewZone: () => select('new'),
    cancel,
    draft,
    setDraft,
    dirty,
    reset,
    resetCount,
    refresh: () => {
      reset();
      void zonesQ.refetch();
    },
    enabled,
    zonePx,
    zonePct,
    selfIntersecting,
    setNum,
    setAreaPercent,
    setAreaPixels,
    setAlarmChannel,
    setAlarmHex,
    applyPreset,
    errors,
    save,
    saving: saveMutation.isPending,
    remove,
    removing: deleteMutation.isPending,
  };
}
