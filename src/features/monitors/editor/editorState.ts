/**
 * Pure helpers behind the monitor editor: draft extraction, value
 * comparison, id-list (de)serialisation and the random web colour. Kept out
 * of the component files so Fast Refresh keeps working and tests can hit
 * them without rendering.
 */
import type { Monitor } from '@/types';
import { TABS, type FieldValue } from './fields';


/**
 * Snapshot every editable field from a Monitor record into draft shape.
 * Write-only fields land as `null` because `MonitorResponse` omits them —
 * see {@link WRITE_ONLY_KEYS}.
 */
export function extractEditableFields(monitor: Monitor): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  const m = monitor as unknown as Record<string, unknown>;
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

/**
 * Fields the API takes but never gives back: `MonitorResponse` omits `pass`
 * and `onvif_password` so a stolen read cannot leak camera credentials.
 * The draft therefore starts blank for them no matter what is stored, and
 * a blank one means "leave the stored secret alone" — {@link isUnsetSecret}
 * keeps it out of the PATCH so saving an unrelated field cannot wipe a
 * password the operator never saw.
 *
 * Derived from the field table rather than hardcoded, so a new password
 * field is covered the day it is added.
 */
export const WRITE_ONLY_KEYS: ReadonlySet<string> = new Set(
  TABS.flatMap((tab) => tab.fields.filter((f) => f.kind === 'password').map((f) => f.key)),
);

/** True for a write-only field the operator has not typed into. */
export function isUnsetSecret(key: string, value: FieldValue): boolean {
  return WRITE_ONLY_KEYS.has(key) && (value == null || String(value) === '');
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

