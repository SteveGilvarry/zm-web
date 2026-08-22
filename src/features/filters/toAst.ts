import type {
  FilterAstExpr, FilterAstOp, FilterAstQuery, FilterAstValue, FilterQuery, FilterTerm,
} from '@/api/filters';
import { attrMeta, SORT_FIELD_TO_AST, toRfc3339, type FilterAttrKind } from './attrs';
import { buildTermTree, type TermTree } from './tree';
import type { FilterSortField } from '@/api/filters';

/**
 * Map ZoneMinder terms to the backend's structured `FilterQuery` AST so
 * `POST /filters/preview` can run the filter server-side (paginated, ACL
 * applied, exact SQL semantics for everything it models).
 *
 * Verified against the live backend (2026-08-21):
 *  - numeric fields need JSON numbers (`"0"` → 400 "does not match the field type")
 *  - datetimes need RFC-3339 (`2026-08-01 00:00:00` → 400)
 *  - `regexp` / `not_regexp` → 400 "not supported in preview"
 *  - `monitor_name` → 400 "not supported in preview yet"
 *  - an empty group → 400, so an empty term list becomes the tautology `id > 0`
 *
 * Anything outside that is reported in `reasons`; the caller falls back to
 * the client evaluator for those filters.
 */
export type AstResult =
  | { ok: true; ast: FilterAstQuery; notes: string[] }
  | { ok: false; reasons: string[] };

const OP_MAP: Partial<Record<FilterTerm['op'], FilterAstOp>> = {
  '=': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  'LIKE': 'like',
  'NOT LIKE': 'not_like',
  '=[]': 'in',
  '![]': 'not_in',
};

function scalar(kind: FilterAttrKind, raw: string): FilterAstValue | null {
  const v = raw.trim();
  switch (kind) {
    case 'number':
    case 'monitor':
    case 'storage': {
      if (v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      if (v === '0' || v === '1') return Number(v);
      return null;
    case 'datetime':
      return toRfc3339(v);
    case 'string':
    case 'monitorName':
      return raw;
    case 'date':
    case 'time':
    case 'weekday':
      return null;
  }
}

function leafToAst(term: FilterTerm, reasons: string[]): FilterAstExpr | null {
  const meta = attrMeta(term.attr);
  if (!meta || !meta.astField) {
    reasons.push(`${term.attr}: server-side evaluation only`);
    return null;
  }
  const field = meta.astField;
  const val = term.val == null ? '' : String(term.val);

  if (term.op === 'IS' || term.op === 'IS NOT') {
    if (val.trim().toUpperCase() === 'NULL' || val.trim() === '') {
      return { field, op: term.op === 'IS' ? 'is_null' : 'is_not_null' };
    }
    reasons.push(`${term.attr} ${term.op} ${val}: only NULL is previewable`);
    return null;
  }
  if (term.op === '=~' || term.op === '!~') {
    reasons.push(`${term.attr} ${term.op}: regex is not supported by preview`);
    return null;
  }
  const op = OP_MAP[term.op];
  if (!op) {
    reasons.push(`${term.attr}: operator ${term.op} is not previewable`);
    return null;
  }

  if (op === 'in' || op === 'not_in') {
    const parts = val.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const values: Array<string | number> = [];
    for (const p of parts) {
      const s = scalar(meta.kind, p);
      if (s == null || Array.isArray(s) || typeof s === 'boolean') {
        reasons.push(`${term.attr} ${term.op}: "${p}" is not a valid value`);
        return null;
      }
      values.push(s);
    }
    if (values.length === 0) {
      reasons.push(`${term.attr} ${term.op}: empty set`);
      return null;
    }
    return { field, op, value: values };
  }

  let value = scalar(meta.kind, val);
  if (value == null) {
    reasons.push(`${term.attr} ${term.op} "${val}": value cannot be previewed`);
    return null;
  }
  // ZM wraps LIKE values as %val% ("contains").
  if ((op === 'like' || op === 'not_like') && typeof value === 'string') {
    value = `%${value}%`;
  }
  return { field, op, value };
}

function treeToAst(node: TermTree, reasons: string[]): FilterAstExpr | null {
  if (node.kind === 'leaf') return leafToAst(node.term, reasons);
  const rules: FilterAstExpr[] = [];
  for (const r of node.rules) {
    const out = treeToAst(r, reasons);
    if (!out) return null;
    rules.push(out);
  }
  if (rules.length === 0) {
    reasons.push('empty bracket group');
    return null;
  }
  return rules.length === 1 ? rules[0] : { match: node.match, rules };
}

export function termsToAst(query: FilterQuery): AstResult {
  const reasons: string[] = [];
  const notes: string[] = [];
  const { tree, balanced } = buildTermTree(query.terms);
  if (!balanced) reasons.push('brackets do not balance');

  let where: FilterAstExpr;
  if (tree == null) {
    // No terms = every event. The backend rejects an empty group.
    where = { match: 'all', rules: [{ field: 'id', op: 'gt', value: 0 }] };
  } else {
    const out = treeToAst(tree, reasons);
    if (!out || reasons.length > 0) return { ok: false, reasons };
    where = 'match' in out ? out : { match: 'all', rules: [out] };
  }
  if (reasons.length > 0) return { ok: false, reasons };

  const ast: FilterAstQuery = { where };

  const sortField = (query.sort_field ?? '') as FilterSortField;
  if (sortField !== '') {
    const astField = SORT_FIELD_TO_AST[sortField];
    if (astField) ast.sort = { field: astField, dir: query.sort_asc === '1' ? 'asc' : 'desc' };
    else notes.push(`sort by ${sortField} is not available in preview`);
  }

  const limit = Number(query.limit ?? 0);
  if (Number.isFinite(limit) && limit > 0) ast.limit = Math.floor(limit);

  return { ok: true, ast, notes };
}
