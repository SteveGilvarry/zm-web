import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Point } from '@/api/zones';
import {
  MIN_FILTER_KERNEL, boxFromCorners, centredBox, loadObjectRatios, normalizeRatio,
  objectTooNarrowToFilter, saveObjectRatio, zoneSettingsForObject,
  type ObjectRatios, type PixelBox,
} from './objectSize';
import type { ZoneDraft, ZoneEditorState, ZoneNumField } from './useZoneEditor';

/** The fields a measurement writes, and so the ones its undo restores. */
const MANAGED = [
  'min_pixel_threshold', 'max_pixel_threshold',
  'filter_x', 'filter_y',
  'min_alarm_pixels', 'max_alarm_pixels',
  'min_filter_pixels', 'max_filter_pixels',
  'min_blob_pixels', 'max_blob_pixels',
  'min_blobs', 'max_blobs',
  'overload_frames',
] as const satisfies readonly ZoneNumField[];

type Snapshot = { checkMethod: string } & Partial<Record<ZoneNumField, string>>;

export interface ObjectSizeToolState {
  /** Drawing a box on the picture measures instead of moving vertices. */
  armed: boolean;
  toggleArmed: () => void;
  /** The box last measured, in capture pixels. */
  box: PixelBox | null;
  /** Pointer drag over the picture: `final` on release. */
  measure: (a: Point, b: Point, final: boolean) => void;
  /** The typed object size, as the two boxes hold it. */
  typedWidth: string;
  typedHeight: string;
  setTypedWidth: (v: string) => void;
  setTypedHeight: (v: string) => void;
  /** Legacy's Apply: a box of the typed size, centred in the frame. */
  applyTypedSize: () => void;
  ratios: ObjectRatios;
  setRatio: (key: keyof ObjectRatios, raw: string) => void;
  /** Legacy's undo button shows once a measurement changed something. */
  canUndo: boolean;
  undo: () => void;
  /** The ratio table stays up after a measurement so it can be tuned. */
  showSettings: boolean;
  /** What legacy says in an `alert`, shown inline here. */
  message: string | null;
  /** Fields the last measurement changed, for highlighting. */
  changed: ReadonlySet<string>;
  /* A still image stands in for the live view; read locally, never uploaded. */
  stillUrl: string | null;
  stillShown: boolean;
  /** First press asks for a file; after that it toggles still against live. */
  loadStill: (file: File) => void;
  setStillShown: (shown: boolean) => void;
}

const measurable = (type: string) => type !== 'Inactive' && type !== 'Privacy';

/**
 * The object-size tool (`zone.php:208-370`, `zone-object-size.js`) over a
 * zone editor's state. Drag a box round the smallest object that should
 * alarm, or type its size, and the thresholds follow; Undo puts back what
 * was there before the first box of the session.
 */
export function useObjectSizeTool(editor: ZoneEditorState): ObjectSizeToolState {
  const { t } = useTranslation();
  const { draft, setDraft, zonePx, frame } = editor;
  const [armed, setArmed] = useState(false);
  const [box, setBox] = useState<PixelBox | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ratios, setRatios] = useState<ObjectRatios>(() => loadObjectRatios());
  const [typedWidth, setTypedWidth] = useState('');
  const [typedHeight, setTypedHeight] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [stillShown, setStillShown] = useState(false);
  // A measurement belongs to one zone and one load of it: switching zone or
  // pressing Reset drops it, as legacy's `forgetMeasurement` does.
  const [owner, setOwner] = useState<{ id: unknown; reset: number }>({ id: editor.selectedId, reset: editor.resetCount });
  if (owner.id !== editor.selectedId || owner.reset !== editor.resetCount) {
    setOwner({ id: editor.selectedId, reset: editor.resetCount });
    setArmed(false);
    setBox(null);
    setSnapshot(null);
    setChanged(new Set());
    setMessage(null);
    setTypedWidth('');
    setTypedHeight('');
  }

  const forget = () => {
    setBox(null);
    setSnapshot(null);
    setChanged(new Set());
  };

  /** Writes the derived settings into the draft; false when nothing applied. */
  const apply = (b: PixelBox, base: ZoneDraft, ratiosNow: ObjectRatios): boolean => {
    const area = b.w * b.h;
    // A box this small is normal mid-drag. Change nothing, say nothing.
    if (!(area > 0) || !(zonePx > 0)) return false;
    let snap = snapshot;
    if (!snap) {
      snap = { checkMethod: base.checkMethod };
      for (const f of MANAGED) snap[f] = base.nums[f];
      setSnapshot(snap);
    }
    const values = zoneSettingsForObject(area, zonePx, snap, ratiosNow);
    if (!values) return false;
    const nums = { ...base.nums };
    const marks = new Set<string>();
    for (const f of MANAGED) {
      nums[f] = values[f];
      if (values[f] !== (snap[f] ?? '')) marks.add(f);
    }
    if (snap.checkMethod !== values.checkMethod) marks.add('check_method');
    setChanged(marks);
    setBox(b);
    setDraft({ ...base, checkMethod: values.checkMethod, nums });
    return true;
  };

  /** Warnings live here, not in `apply`, which runs on every pointer move. */
  const finish = (b: PixelBox, base: ZoneDraft) => {
    if (!apply(b, base, ratios)) return;
    setTypedWidth(String(Math.round(b.w)));
    setTypedHeight(String(Math.round(b.h)));
    const fx = Math.max(parseInt(base.nums.filter_x, 10) || 0, MIN_FILTER_KERNEL);
    const fy = Math.max(parseInt(base.nums.filter_y, 10) || 0, MIN_FILTER_KERNEL);
    setMessage(objectTooNarrowToFilter(b.w, b.h, fx, fy)
      ? t('That object is narrower than the {{x}}x{{y}} filter, which erases it entirely. Reduce the filter size, or draw a box around a larger object.', { x: fx, y: fy })
      : null);
  };

  const toggleArmed = () => {
    if (!draft) return;
    if (!armed && !measurable(draft.type)) {
      setMessage(t('Object measuring does not apply to Inactive or Privacy zones'));
      return;
    }
    // Arming starts a fresh measurement.
    if (!armed) forget();
    setMessage(null);
    setArmed(!armed);
  };

  const measure = (a: Point, b: Point, final: boolean) => {
    if (!armed || !draft) return;
    if (!measurable(draft.type)) {
      setArmed(false);
      forget();
      return;
    }
    const bx = boxFromCorners(a, b);
    if (final) finish(bx, draft);
    else if (!apply(bx, draft, ratios)) setBox(bx);
  };

  const applyTypedSize = () => {
    if (!draft) return;
    if (!measurable(draft.type)) {
      setMessage(t('Object measuring does not apply to Inactive or Privacy zones'));
      return;
    }
    const bx = centredBox(parseFloat(typedWidth), parseFloat(typedHeight), frame);
    if (!bx) {
      setMessage(t('Enter the width and height of the object in pixels first'));
      return;
    }
    finish(bx, draft);
  };

  const setRatio = (key: keyof ObjectRatios, raw: string) => {
    const n = normalizeRatio(raw);
    if (n == null) return;
    const next = { ...ratios, [key]: n };
    setRatios(next);
    saveObjectRatio(key, n);
    // Re-derive from the box already drawn, so the effect is immediate.
    if (box && draft) apply(box, draft, next);
  };

  const undo = () => {
    if (!snapshot || !draft) return;
    const nums = { ...draft.nums };
    for (const f of MANAGED) nums[f] = snapshot[f] ?? '';
    setDraft({ ...draft, checkMethod: snapshot.checkMethod, nums });
    forget();
    setMessage(null);
  };

  const loadStill = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage(t('That file could not be read as an image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : null;
      if (!url) return;
      // The MIME type only says what the file claims to be; decode it first.
      const probe = new Image();
      probe.onload = () => {
        setStillUrl(url);
        setStillShown(true);
        setMessage(null);
      };
      probe.onerror = () => setMessage(t('That file could not be read as an image'));
      probe.src = url;
    };
    reader.onerror = () => setMessage(t('That file could not be read as an image'));
    reader.readAsDataURL(file);
  };

  return {
    armed,
    toggleArmed,
    box,
    measure,
    typedWidth,
    typedHeight,
    setTypedWidth,
    setTypedHeight,
    applyTypedSize,
    ratios,
    setRatio,
    canUndo: snapshot != null,
    undo,
    showSettings: armed || box != null,
    message,
    changed,
    stillUrl,
    stillShown: stillShown && stillUrl != null,
    loadStill,
    setStillShown,
  };
}
