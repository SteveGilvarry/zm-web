import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { FilterAttr, FilterTerm } from '@/api/filters';
import { useFilterAttrLabels, useFilterOpLabels } from '@/features/filters/labels';
import type { EventsTermsMode } from './useEventsListPage';

interface EventsTermsBannerProps {
  mode: EventsTermsMode;
  /** `/filters` search that reopens these terms in the editor. */
  editSearch: { terms?: string; id?: number };
  onClear: () => void;
  variant?: 'modern' | 'classic';
}

/**
 * What the events list shows when it was opened with a term list or a
 * saved filter (the filter editor's List Matches). Legacy swaps the strip
 * for the filter's own terms; this reads them back as one line, with a way
 * to edit them in the filter editor and a way back to the strip.
 */
export function EventsTermsBanner({ mode, editSearch, onClear, variant = 'modern' }: EventsTermsBannerProps) {
  const { t } = useTranslation();
  const attrLabels = useFilterAttrLabels();
  const opLabels = useFilterOpLabels();
  const classic = variant === 'classic';

  const describe = (term: FilterTerm, i: number) => {
    const attr = attrLabels[term.attr as FilterAttr] ?? term.attr;
    const op = opLabels[term.op] ?? term.op;
    const cnj = i === 0 ? '' : term.cnj === 'or' ? `${t('or')} ` : `${t('and')} `;
    const obr = '('.repeat(Number(term.obr) || 0);
    const cbr = ')'.repeat(Number(term.cbr) || 0);
    return `${cnj}${obr}${attr} ${op} ${term.val ?? ''}${cbr}`.trim();
  };

  const heading = mode.filterName
    ? t('Matches of filter {{name}}', { name: mode.filterName })
    : t('Matches of these conditions');

  return (
    <div
      role="status"
      data-testid="events-terms-banner"
      className={clsx(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm',
        classic
          ? 'px-3 py-2 border border-[#bee5eb] bg-[#d1ecf1] text-[#0c5460] rounded-sm'
          : 'px-3 py-1.5 border-b border-border-subtle bg-surface-2 text-fg-muted',
      )}
    >
      <span className={classic ? 'font-semibold' : 'text-fg'}>{heading}</span>
      {mode.loading ? (
        <span>{t('loading…')}</span>
      ) : mode.terms.length === 0 && mode.reasons.length === 0 ? (
        <span>{t('No conditions: every event.')}</span>
      ) : (
        <span className={classic ? 'font-mono text-xs' : 'font-mono text-xs text-fg-dim'}>
          {mode.terms.map(describe).join(' ')}
        </span>
      )}
      {mode.reasons.length > 0 && (
        <span role="alert" className={classic ? 'text-[#a94442]' : 'text-danger'}>
          {t('This list cannot show them ({{reasons}}); open them in the filter editor instead.', {
            reasons: mode.reasons.join('; '),
          })}
        </span>
      )}
      <span className="ms-auto flex items-center gap-3">
        <Link
          to="/filters"
          search={editSearch}
          className={classic ? 'underline hover:text-[#062c33]' : 'text-accent hover:underline'}
        >
          {t('Edit in filter editor')}
        </Link>
        <button
          type="button"
          onClick={onClear}
          className={clsx('inline-flex items-center gap-1', classic ? 'underline hover:text-[#062c33]' : 'hover:text-fg')}
        >
          <X size={12} aria-hidden />
          {t('Back to the filter bar')}
        </button>
      </span>
    </div>
  );
}
