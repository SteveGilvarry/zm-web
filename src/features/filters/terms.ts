import type { FilterTerm } from '@/api/filters';
import type { Monitor } from '@/types';

/**
 * Keep the term list in the shape ZoneMinder writes: the first term has no
 * `cnj`, every later term has one, brackets are string counts.
 */
export function normaliseTerms(terms: FilterTerm[]): FilterTerm[] {
  return terms.map((t, i) => {
    const next: FilterTerm = { ...t };
    if (i === 0) delete next.cnj;
    else if (next.cnj !== 'or') next.cnj = 'and';
    return next;
  });
}

export function newTerm(monitors: Monitor[]): FilterTerm {
  return {
    cnj: 'and',
    obr: '0',
    attr: 'MonitorId',
    op: '=',
    val: monitors[0] ? String(monitors[0].id) : '',
    cbr: '0',
  };
}
