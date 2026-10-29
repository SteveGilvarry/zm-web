import { getEvents } from '@/api/events';
import { previewFilter, type FilterQuery } from '@/api/filters';
import { EXPORT_MAX_EVENTS } from '@/features/events/eventMedia';
import type { Monitor, ZmEvent } from '@/types';
import { evaluateFilter } from './evaluate';
import { termsToAst } from './toAst';
import { CLIENT_PREVIEW_WINDOW } from './useFilterPreview';

/**
 * The set legacy's Export Matches hands to `?view=export` (filter.js:178):
 * every event the form's terms match, unsaved edits included. zm-api packs
 * at most 500 events per archive, so this fetches the first 500 and reports
 * the full count for the dialog's notice. Terms the preview cannot run fall
 * back to the client evaluator over the most recent events, as List Matches
 * does.
 */
export async function fetchExportMatches(
  query: FilterQuery,
  monitors: Monitor[],
): Promise<{ events: ZmEvent[]; total: number }> {
  const ast = termsToAst(query);
  if (ast.ok) {
    const page = await previewFilter(ast.ast, { page: 1, page_size: EXPORT_MAX_EVENTS });
    return { events: page.items, total: page.total };
  }
  const recent = await getEvents({ page: 1, page_size: CLIENT_PREVIEW_WINDOW });
  const matched = evaluateFilter(query, recent.items, { monitors });
  return { events: matched.slice(0, EXPORT_MAX_EVENTS), total: matched.length };
}
