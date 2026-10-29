import type { Tag } from '@/api/tags';

/**
 * Tags in legacy's `availableTags` order: the ones this operator applied
 * most recently first (`tagRecency`), then the rest in the order `/tags`
 * lists them.
 */
export function orderByRecency(tags: Tag[], recency: number[]): Tag[] {
  const rank = new Map(recency.map((id, i) => [id, i]));
  return tags
    .map((tag, i) => ({ tag, i, r: rank.get(tag.id) }))
    .sort((a, b) => (a.r ?? Infinity) - (b.r ?? Infinity) || a.i - b.i)
    .map((x) => x.tag);
}
