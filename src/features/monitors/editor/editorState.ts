/**
 * Pure helpers behind the monitor editor: draft extraction, value
 * comparison, id-list (de)serialisation and the random web colour. Kept out
 * of the component files so Fast Refresh keeps working and tests can hit
 * them without rendering.
 */
import { normalizeMonitor } from '@/api/monitors';
import type { Monitor } from '@/types';
import { TABS, type FieldValue } from './fields';


/**
 * Snapshot every editable field from a Monitor record into draft shape.
 * Enum fields are mapped to the request casing first (`ROTATE_90` →
 * `Rotate90`) so the selects show the stored value rather than their first
 * option, and so the PATCH diff carries values the backend accepts.
 */
export function extractEditableFields(monitor: Monitor): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  const m = normalizeMonitor(monitor) as unknown as Record<string, unknown>;
  for (const tab of TABS) {
    for (const f of tab.fields) {
      if (f.kind === 'group') continue;
      const raw = m[f.key];
      if (raw == null) out[f.key] = null;
      else if (typeof raw === 'object') out[f.key] = String(raw);
      else out[f.key] = raw as FieldValue;
    }
  }
  return out;
}

export function sameValue(a: FieldValue, b: FieldValue): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Loose-eq on number↔string so '0' === 0.
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}

export function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((id) => s.has(id));
}

/** `1,2,3` ↔ `[1, 2, 3]` for `linked_monitors`. */
export function parseIdList(value: FieldValue): number[] {
  if (value == null || String(value).trim() === '') return [];
  return String(value).split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
}

export function serializeIdList(ids: number[]): string | null {
  return ids.length ? [...ids].sort((a, b) => a - b).join(',') : null;
}


export const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** A random `#rrggbb`, like the legacy "sync" button beside Web Colour. */
export function randomHexColour(rand: () => number = Math.random): string {
  const n = Math.floor(rand() * 0xffffff);
  return `#${n.toString(16).padStart(6, '0')}`;
}

