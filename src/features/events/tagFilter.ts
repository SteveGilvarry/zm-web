import { getEvents, TAG_ANY, TAG_NONE } from '@/api/events';
import type { FilterAstExpr } from '@/api/filters';

/**
 * One pick in the events list's Tags box: a tag id, or legacy's two pseudo
 * options — No Tag (`0` in ZoneMinder, `none` here) and Any Tag (`-1`,
 * `any`). Filter.php:1211 lists them first in the same multi-select.
 */
export type TagPick = number | 'none' | 'any';

/**
 * Legacy's executors honour No Tag and Any Tag only as the whole value
 * (FilterTerm.php:468, Filter.pm:449): a list that mixes `0` with tag ids
 * is ORed as plain `T.Id = …` terms, so the sentinel silently does nothing.
 * The pickers therefore keep a sentinel on its own — choosing one clears the
 * rest, choosing anything else clears the sentinel.
 */
export function exclusivePick<T>(prev: readonly T[], next: readonly T[], sentinels: readonly T[]): T[] {
  const added = next.filter((v) => !prev.includes(v));
  const sentinel = added.find((v) => sentinels.includes(v));
  if (sentinel !== undefined) return [sentinel];
  if (added.length > 0) return next.filter((v) => !sentinels.includes(v));
  return [...next];
}

/** `exclusivePick` for the events list's Tags box. */
export function pickTags(prev: readonly TagPick[], next: readonly TagPick[]): TagPick[] {
  return exclusivePick<TagPick>(prev, next, ['none', 'any']);
}

/** Option value ↔ pick, for `<select multiple>`. */
export function tagPickFromOption(value: string): TagPick | undefined {
  if (value === 'none' || value === 'any') return value;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** The picks as `/events`' `tag_id`: a comma list, `none` or `any`. */
export function tagPicksToApi(picks: readonly TagPick[]): string | undefined {
  if (picks.length === 0) return undefined;
  return picks.map((p) => (p === 'none' ? TAG_NONE : p === 'any' ? TAG_ANY : String(p))).join(',');
}

/** The picks as a ZoneMinder `Tags` term value: `0`, `-1`, or a comma list of ids. */
export function tagPicksToTermValue(picks: readonly TagPick[]): string {
  return picks.map((p) => (p === 'none' ? '0' : p === 'any' ? '-1' : String(p))).join(',');
}

/**
 * `/filters/preview` has no tag field, so on that path a tag condition is
 * resolved to event ids first and sent as `id in (…)` / `id not in (…)`.
 * Both shapes ask `/events` for the *tagged* side — `none` is "not among
 * the events carrying any tag" — so the id list stays as short as the set
 * of tagged events. Capped at one page of 1000, as the backend caps pages.
 *
 * `negate` turns the condition around (a `Tags !=` term). Returns `null`
 * when there is nothing to filter on.
 */
export async function resolveTagRule(
  picks: readonly TagPick[],
  negate = false,
): Promise<FilterAstExpr | null> {
  if (picks.length === 0) return null;
  const hasNone = picks.includes('none');
  const hasAny = picks.includes('any');
  if (hasNone && hasAny) return negate ? { field: 'id', op: 'in', value: [] } : null;
  const ids = picks.filter((p): p is number => typeof p === 'number');
  const tagId = hasNone || hasAny ? TAG_ANY : ids.join(',');
  const page = await getEvents({ tag_id: tagId, page: 1, page_size: 1000 });
  const eventIds = page.items.map((e) => e.id);
  // `in` for Any Tag / the picked tags, `not_in` for No Tag; a negated
  // term flips it.
  const inSet = hasNone ? negate : !negate;
  return { field: 'id', op: inSet ? 'in' : 'not_in', value: eventIds };
}
