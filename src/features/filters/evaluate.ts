import type { FilterQuery, FilterRule } from '@/api/filters';
import type { ZmEvent } from '@/types';

/**
 * Run a FilterQuery against an array of events on the client side. ZoneMinder
 * normally evaluates these server-side via the filter daemon; we replay the
 * same semantics in JS for the List Matches preview and the manual Execute Now
 * dispatch, until a backend execute-filter endpoint exists.
 *
 * Rules combine left-to-right per their conjunction field. The first rule's
 * conjunction is ignored. For example
 *   r1 AND r2 OR r3
 * evaluates as `((r1 AND r2) OR r3)`. That's not strictly the same as ZM's
 * server-side precedence, but it's a deterministic, predictable rule operators
 * can reason about — and it matches the visual top-down reading order.
 */
export function evaluateFilter(query: FilterQuery, events: ZmEvent[]): ZmEvent[] {
  if (query.rules.length === 0) return events.slice();

  const matched = events.filter((e) => evalRules(query.rules, e));

  // Apply sort + limit hints if present.
  if (query.sort) {
    const dir = query.sort.dir === 'asc' ? 1 : -1;
    matched.sort((a, b) => {
      const av = a[query.sort!.field as keyof ZmEvent] as unknown;
      const bv = b[query.sort!.field as keyof ZmEvent] as unknown;
      if (typeof av === 'string' && typeof bv === 'string') return dir * av.localeCompare(bv);
      const an = Number(av) || 0;
      const bn = Number(bv) || 0;
      return dir * (an - bn);
    });
  }
  if (query.limit != null && query.limit > 0) return matched.slice(0, query.limit);
  return matched;
}

function evalRules(rules: FilterRule[], event: ZmEvent): boolean {
  let acc = matchRule(rules[0], event);
  for (let i = 1; i < rules.length; i++) {
    const r = rules[i];
    const next = matchRule(r, event);
    acc = r.conjunction === 'or' ? acc || next : acc && next;
  }
  return acc;
}

function matchRule(rule: FilterRule, event: ZmEvent): boolean {
  const raw = (event as unknown as Record<string, unknown>)[rule.field];
  const cmp = rule.value;

  switch (rule.operator) {
    case '=':        return looseEq(raw, cmp);
    case '!=':       return !looseEq(raw, cmp);
    case '>':        return Number(raw) > Number(cmp);
    case '<':        return Number(raw) < Number(cmp);
    case 'contains': return String(raw ?? '').toLowerCase().includes(cmp.toLowerCase());
    case 'starts':   return String(raw ?? '').toLowerCase().startsWith(cmp.toLowerCase());
    case 'ends':     return String(raw ?? '').toLowerCase().endsWith(cmp.toLowerCase());
  }
}

function looseEq(a: unknown, cmp: string): boolean {
  if (a == null) return cmp === '' || cmp === 'null';
  // Booleans-as-int — ZM uses 0/1 on the wire.
  if (cmp === '1' || cmp === '0') return Number(a) === Number(cmp);
  if (typeof a === 'number') return Number(cmp) === a;
  return String(a) === cmp;
}
