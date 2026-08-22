import type { FilterTerm } from '@/api/filters';

/**
 * A ZoneMinder term list turned into a boolean tree. `cnj` joins a term to
 * the one before it; `obr` / `cbr` are counts of `(` before and `)` after.
 * Precedence follows the SQL ZM generates from the same tokens: AND binds
 * tighter than OR, brackets override.
 *
 * Both the client evaluator and the AST mapper walk this tree so they cannot
 * disagree on grouping.
 */
export type TermTree =
  | { kind: 'group'; match: 'all' | 'any'; rules: TermTree[] }
  | { kind: 'leaf'; term: FilterTerm; index: number };

export interface TermTreeResult {
  /** null when there are no terms. */
  tree: TermTree | null;
  /** False when brackets do not balance (parsed tolerantly anyway). */
  balanced: boolean;
}

type Token = '(' | ')' | 'and' | 'or' | { term: FilterTerm; index: number };

export function bracketCount(v: unknown): number {
  if (typeof v === 'number') return Math.max(0, Math.floor(v));
  if (typeof v !== 'string') return 0;
  const s = v.trim();
  if (s === '') return 0;
  // ZM writes counts ("2"); tolerate literal brackets ("((") as well.
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return (s.match(/[()]/g) ?? []).length;
}

export function buildTermTree(terms: FilterTerm[]): TermTreeResult {
  if (terms.length === 0) return { tree: null, balanced: true };

  const tokens: Token[] = [];
  terms.forEach((term, index) => {
    if (index > 0) tokens.push(term.cnj === 'or' ? 'or' : 'and');
    for (let k = 0; k < bracketCount(term.obr); k++) tokens.push('(');
    tokens.push({ term, index });
    for (let k = 0; k < bracketCount(term.cbr); k++) tokens.push(')');
  });

  let pos = 0;
  let balanced = true;

  const parseExpr = (): TermTree => {
    const nodes: TermTree[] = [parseAnd()];
    while (tokens[pos] === 'or') {
      pos++;
      nodes.push(parseAnd());
    }
    return nodes.length === 1 ? nodes[0] : { kind: 'group', match: 'any', rules: nodes };
  };
  const parseAnd = (): TermTree => {
    const nodes: TermTree[] = [parseFactor()];
    while (tokens[pos] === 'and') {
      pos++;
      nodes.push(parseFactor());
    }
    return nodes.length === 1 ? nodes[0] : { kind: 'group', match: 'all', rules: nodes };
  };
  const parseFactor = (): TermTree => {
    const t = tokens[pos++];
    if (t === '(') {
      const inner = parseExpr();
      if (tokens[pos] === ')') pos++;
      else balanced = false;
      return inner;
    }
    if (typeof t === 'object') return { kind: 'leaf', term: t.term, index: t.index };
    // Stray operator / closing bracket where a term was expected.
    balanced = false;
    return { kind: 'group', match: 'all', rules: [] };
  };

  const tree = parseExpr();
  if (pos < tokens.length) balanced = false;
  return { tree, balanced };
}
