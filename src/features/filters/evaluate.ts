import type { FilterQuery, FilterRule } from '@/api/filters';
import type { ZmEvent } from '@/types';

/**
 * Run a FilterQuery against an array of events on the client side. ZoneMinder
 * normally evaluates these server-side via the filter daemon; we replay the
 * same semantics in JS for the List Matches preview and the manual Execute Now
 * dispatch, until a backend execute-filter endpoint exists.
 *
 * Rules combine left-to-right per their conjunction field. The first rule's
 * conjunction is ignored. Bracket grouping (`bracket_open` / `bracket_close`)
 * is interpreted with classic precedence: open before the rule, close after,
 * exactly like the legacy `obr`/`cbr` columns.
 */
export function evaluateFilter(query: FilterQuery, events: ZmEvent[]): ZmEvent[] {
  // No rules → no filtering; everything passes through to sort + limit.
  // (Earlier versions short-circuited here and dropped sort/limit on the
  // floor, which broke 'list all events newest-first' style queries.)
  const matched =
    query.rules.length === 0
      ? events.slice()
      : events.filter((e) => evalRules(query.rules, e));

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

/**
 * Evaluate rules with bracket grouping. We emit a token stream of
 * `(`, value, op, `)` and use the shunting-yard-lite for boolean AND/OR.
 * Falls back to plain left-to-right reduction when no brackets are used.
 */
function evalRules(rules: FilterRule[], event: ZmEvent): boolean {
  // Fast path: no brackets anywhere → left-to-right reduce, like before.
  const hasBrackets = rules.some(
    (r) => (r.bracket_open ?? 0) > 0 || (r.bracket_close ?? 0) > 0,
  );
  if (!hasBrackets) {
    let acc = matchRule(rules[0], event);
    for (let i = 1; i < rules.length; i++) {
      const r = rules[i];
      const next = matchRule(r, event);
      acc = r.conjunction === 'or' ? acc || next : acc && next;
    }
    return acc;
  }

  // Bracket path: build a token list then reduce. Each rule becomes
  //   [conj?, openParens..., value, closeParens...]
  // The conjunction must come *before* the opening paren so the parser sees
  //   `lhs OP ( rhs )` rather than `lhs ( OP rhs )`. The first rule's
  // conjunction is dropped (no left-hand side to join).
  type Token = '(' | ')' | 'and' | 'or' | boolean;
  const tokens: Token[] = [];
  rules.forEach((r, i) => {
    if (i > 0) tokens.push(r.conjunction === 'or' ? 'or' : 'and');
    for (let k = 0; k < (r.bracket_open ?? 0); k++) tokens.push('(');
    tokens.push(matchRule(r, event));
    for (let k = 0; k < (r.bracket_close ?? 0); k++) tokens.push(')');
  });

  return reduceTokens(tokens);
}

type BoolToken = '(' | ')' | 'and' | 'or' | boolean;

function reduceTokens(tokens: BoolToken[]): boolean {
  // Recursive-descent: parse a series of `and`-joined terms, then `or` them.
  // ZM doesn't define precedence — legacy SQL gives AND > OR, so we honour
  // the same precedence here.
  let pos = 0;

  function parseExpr(): boolean {
    let v = parseTerm();
    while (pos < tokens.length && tokens[pos] === 'or') {
      pos++;
      const rhs = parseTerm();
      v = v || rhs;
    }
    return v;
  }
  function parseTerm(): boolean {
    let v = parseFactor();
    while (pos < tokens.length && tokens[pos] === 'and') {
      pos++;
      const rhs = parseFactor();
      v = v && rhs;
    }
    return v;
  }
  function parseFactor(): boolean {
    const t = tokens[pos++];
    if (t === '(') {
      const v = parseExpr();
      if (tokens[pos] === ')') pos++; // tolerate unbalanced
      return v;
    }
    return typeof t === 'boolean' ? t : false;
  }
  return parseExpr();
}

function matchRule(rule: FilterRule, event: ZmEvent): boolean {
  const raw = (event as unknown as Record<string, unknown>)[rule.field];
  const cmp = rule.value;

  switch (rule.operator) {
    case '=':        return looseEq(raw, cmp);
    case '!=':       return !looseEq(raw, cmp);
    case '>':        return Number(raw) > Number(cmp);
    case '>=':       return Number(raw) >= Number(cmp);
    case '<':        return Number(raw) < Number(cmp);
    case '<=':       return Number(raw) <= Number(cmp);
    case 'contains': return String(raw ?? '').toLowerCase().includes(cmp.toLowerCase());
    case 'starts':   return String(raw ?? '').toLowerCase().startsWith(cmp.toLowerCase());
    case 'ends':     return String(raw ?? '').toLowerCase().endsWith(cmp.toLowerCase());
    case '=~':       return safeRegex(cmp).test(String(raw ?? ''));
    case '!~':       return !safeRegex(cmp).test(String(raw ?? ''));
    case '=[]':      return splitInSet(cmp).includes(String(raw ?? ''));
    case '![]':      return !splitInSet(cmp).includes(String(raw ?? ''));
    case 'IS':       return matchIs(raw, cmp);
    case 'IS NOT':   return !matchIs(raw, cmp);
    case 'LIKE':     return likeMatch(String(raw ?? ''), cmp);
    case 'NOT LIKE': return !likeMatch(String(raw ?? ''), cmp);
  }
}

function looseEq(a: unknown, cmp: string): boolean {
  if (a == null) return cmp === '' || cmp === 'null';
  // Booleans-as-int — ZM uses 0/1 on the wire.
  if (cmp === '1' || cmp === '0') return Number(a) === Number(cmp);
  if (typeof a === 'number') return Number(cmp) === a;
  return String(a) === cmp;
}

function safeRegex(src: string): RegExp {
  try {
    return new RegExp(src, 'i');
  } catch {
    // Malformed pattern → match nothing (mirrors legacy "no rows" behaviour).
    return /(?!)/;
  }
}

function splitInSet(cmp: string): string[] {
  return cmp.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * `IS` / `IS NOT` value combobox restricts to NULL / 0 / 1 in legacy. We mirror
 * that — `NULL` matches missing / nullish; `0` and `1` are integer compares.
 */
function matchIs(raw: unknown, cmp: string): boolean {
  const v = cmp.trim().toUpperCase();
  if (v === 'NULL' || v === '') return raw == null || raw === '';
  return Number(raw) === Number(cmp);
}

/** SQL-LIKE: `%` ⇒ `.*`, `_` ⇒ `.`. Case-insensitive, anchored. */
function likeMatch(haystack: string, pattern: string): boolean {
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // RegExp-escape
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  try {
    return new RegExp(`^${esc}$`, 'i').test(haystack);
  } catch {
    return false;
  }
}
