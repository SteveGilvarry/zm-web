import type { FilterColumns, FilterQuery } from '@/api/filters';
import { buildTermTree } from './tree';

/** Anything the user has to read before the save can go through. */
export interface DraftValidation {
  /** Hard stops — the save does not happen. */
  errors: string[];
  /**
   * Risky-but-legal saves. The page puts the first one in a confirm dialog;
   * legacy `filter.js` asks with `confirm()` and saves on OK.
   */
  confirms: string[];
  /** Saved anyway, but the operator is told (legacy uses `alert()` here). */
  notices: string[];
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Port of ZoneMinder's `validateForm()` (`web/skins/classic/views/js/filter.js`).
 *
 * The three legacy branches are an else-if chain, so at most one confirm is
 * ever raised — auto-delete outranks the disk-space warning, which outranks
 * the background-with-no-action notice.
 */
export function validateDraft(
  query: FilterQuery | null,
  columns: FilterColumns,
  t: Translate,
): DraftValidation {
  const errors: string[] = [];
  const confirms: string[] = [];
  const notices: string[] = [];

  if (!query) {
    errors.push(t('This filter’s saved conditions cannot be read, so it cannot be saved over.'));
    return { errors, confirms, notices };
  }

  const terms = query.terms;
  if (terms.some((term) => term.val == null || String(term.val).trim() === '')) {
    errors.push(t('Every condition needs a value.'));
  }
  if (!buildTermTree(terms).balanced) {
    errors.push(t('The brackets in the conditions are unbalanced.'));
  }

  const limit = query.limit == null ? '' : String(query.limit).trim();
  if (limit !== '' && /\D/.test(limit)) {
    errors.push(t('The limit must be a whole number, or empty.'));
  }

  const has = (attr: string) => terms.some((term) => term.attr === attr);
  // Legacy's background check leaves Upload out of this list; it is not an
  // oversight worth fixing here, the point is to match what ZM warns about.
  const anyAction = [
    'auto_archive', 'auto_unarchive', 'update_disk_space', 'auto_video', 'auto_email',
    'auto_message', 'auto_execute', 'auto_delete', 'auto_copy', 'auto_move',
  ].some((key) => (columns as unknown as Record<string, unknown>)[key] === 1);

  if (columns.auto_delete === 1 && !has('Archived')) {
    confirms.push(t(
      'This filter deletes events and has no Archive Status condition, so it can delete archived events too. Save it anyway?',
    ));
  } else if (columns.update_disk_space === 1
    && !has('EndDateTime') && !has('EndTime') && !has('EndDate')) {
    confirms.push(t(
      'Updating disk space with no end-time condition re-reads every matching event, including ones still recording. Save it anyway?',
    ));
  } else if (columns.background === 1 && !anyAction) {
    notices.push(t('This filter runs in the background but has no action ticked, so it will do nothing.'));
  }

  return { errors, confirms, notices };
}
