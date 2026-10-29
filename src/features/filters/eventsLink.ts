import { isEventSortField, type EventSortField } from '@/api/events';
import type { FilterQuery, FilterSortField } from '@/api/filters';
import { SORT_FIELD_TO_AST } from './attrs';

/** `/events` search for List Matches: the terms, and the filter's sort when the list can sort by it. */
export interface EventsMatchesSearch {
  terms: string;
  sort?: EventSortField;
  dir?: 'asc' | 'desc';
}

/**
 * Legacy List Matches submits the form to `?view=events` (filter.js:161):
 * the events list then shows exactly these terms. The term list travels as
 * `terms`, which `/events` runs through `/filters/preview`; the filter's
 * Sort by comes along when it maps onto an events sort field.
 */
export function eventsSearchFromQuery(query: FilterQuery): EventsMatchesSearch {
  const out: EventsMatchesSearch = { terms: JSON.stringify(query.terms) };
  const field = SORT_FIELD_TO_AST[(query.sort_field ?? '') as FilterSortField];
  if (field && isEventSortField(field)) {
    out.sort = field;
    out.dir = query.sort_asc === '1' ? 'asc' : 'desc';
  }
  return out;
}
