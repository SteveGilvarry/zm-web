import type { EventSortField, SortDirection } from '@/api/events';
import type { FilterAstExpr, FilterAstQuery, FilterTerm } from '@/api/filters';
import type { GroupMonitor } from '@/api/groups';
import { splitTagIds } from '@/features/filters/attrs';
import { termsToAst } from '@/features/filters/toAst';
import { tagsFromSearch } from './eventsSearch';
import { resolveTagRule } from './tagFilter';

/**
 * Turn a ZoneMinder term list into a `/filters/preview` query, so the events
 * list can show what a filter matches (legacy List Matches →
 * `?view=events&filter…`).
 *
 * The preview AST has no Group or Tags field, so those two terms are
 * rewritten first, keeping their conjunction and brackets:
 *  - `Group = 1,2` → `MonitorId =[] <the groups' monitors>`;
 *  - `Tags = …` → `Id =[] <the matching event ids>` (see `resolveTagRule`).
 * Everything else goes through `termsToAst` unchanged; what it still cannot
 * model comes back as `reasons`.
 *
 * The table's sort replaces the filter's own, as on legacy's events page.
 */
export async function termsToPreviewQuery(
  terms: FilterTerm[],
  opts: { groupMonitors: GroupMonitor[]; sort: EventSortField; dir: SortDirection; limit?: number },
): Promise<{ ok: true; ast: FilterAstQuery } | { ok: false; reasons: string[] }> {
  const rewritten: FilterTerm[] = [];
  for (const term of terms) {
    rewritten.push(await rewriteTerm(term, opts.groupMonitors));
  }
  const res = termsToAst({ terms: rewritten, limit: opts.limit ? String(opts.limit) : undefined });
  if (!res.ok) return res;
  return { ok: true, ast: { ...res.ast, sort: { field: opts.sort, dir: opts.dir } } };
}

/**
 * What would stop `termsToPreviewQuery` from listing these terms, without
 * fetching anything: Group and Tags are always rewritable, so they are
 * stood in for by a tautology and the rest is checked as-is.
 */
export function previewReasons(terms: FilterTerm[]): string[] {
  const probe = terms.map((term) =>
    term.attr === 'Group' || term.attr === 'Tags' ? { ...term, ...EVERYTHING } : term);
  const res = termsToAst({ terms: probe });
  return res.ok ? [] : res.reasons;
}

/** `Id = 0`: matches nothing (event ids start at 1). */
const NOTHING = { attr: 'Id', op: '=', val: '0' } as const;
/** `Id > 0`: matches everything. */
const EVERYTHING = { attr: 'Id', op: '>', val: '0' } as const;

async function rewriteTerm(term: FilterTerm, groupMonitors: GroupMonitor[]): Promise<FilterTerm> {
  const negate = term.op === '!=' || term.op === '![]';
  if (term.attr === 'Group') {
    const groups = new Set(splitTagIds(term.val).map(Number));
    const monitors = Array.from(new Set(
      groupMonitors.filter((gm) => groups.has(gm.group_id)).map((gm) => gm.monitor_id),
    ));
    if (monitors.length === 0) return { ...term, ...(negate ? EVERYTHING : NOTHING) };
    return { ...term, attr: 'MonitorId', op: negate ? '![]' : '=[]', val: monitors.join(',') };
  }
  if (term.attr === 'Tags') {
    const rule = await resolveTagRule(tagsFromSearch({ tag: splitTagIds(term.val).join(',') }), negate);
    return { ...term, ...idRuleToTerm(rule) };
  }
  return term;
}

function idRuleToTerm(rule: FilterAstExpr | null): Pick<FilterTerm, 'attr' | 'op' | 'val'> {
  if (!rule || 'match' in rule) return EVERYTHING;
  const ids = Array.isArray(rule.value) ? rule.value : [];
  if (ids.length === 0) return rule.op === 'in' ? NOTHING : EVERYTHING;
  return { attr: 'Id', op: rule.op === 'in' ? '=[]' : '![]', val: ids.join(',') };
}
