/**
 * The `zid` search param: a zone id, or `new`. Legacy links a new zone as
 * `zid=0` (`zones.php:121`), so 0 means new too.
 */
export function parseZoneParam(v: unknown): number | 'new' | null {
  if (v === 'new' || v === 0 || v === '0') return 'new';
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : null;
}
