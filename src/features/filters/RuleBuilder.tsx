import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  FILTER_ATTRS,
  type FilterAttr, type FilterConjunction, type FilterOp, type FilterQuery, type FilterTerm,
} from '@/api/filters';
import type { Monitor, ZmStorage } from '@/types';
import {
  attrMeta, OPS_BY_KIND, PREVIEWABLE_ATTRS, SERVER_ONLY_ATTRS, type FilterAttrKind,
} from './attrs';
import { bracketCount } from './tree';
import { newTerm, normaliseTerms } from './terms';
import { useFilterAttrLabels, useFilterOpLabels, useWeekdayLabels } from './labels';

interface RuleBuilderProps {
  query: FilterQuery;
  monitors: Monitor[];
  storage: ZmStorage[];
  onChange: (q: FilterQuery) => void;
}

const BRACKET_CHOICES = [0, 1, 2, 3];

/**
 * Rule-row builder on ZoneMinder terms:
 *   `[cnj] [(] [attr] [op] [val] [)] [remove]`
 * The attribute menu lists every legacy attribute; the ones the backend
 * preview cannot model sit under their own group so the operator knows
 * "List matches" will be best-effort for them (the daemon still honours them).
 */
export function RuleBuilder({ query, monitors, storage, onChange }: RuleBuilderProps) {
  const { t } = useTranslation();
  const attrLabels = useFilterAttrLabels();
  const opLabels = useFilterOpLabels();

  const setTerms = (terms: FilterTerm[]) => onChange({ ...query, terms: normaliseTerms(terms) });

  const updateTerm = (idx: number, patch: Partial<FilterTerm>) => {
    const next = [...query.terms];
    next[idx] = { ...next[idx], ...patch };
    setTerms(next);
  };
  const removeTerm = (idx: number) => setTerms(query.terms.filter((_, i) => i !== idx));
  const addTerm = () => setTerms([...query.terms, newTerm(monitors)]);

  const select = 'px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-fg focus:outline-none focus:border-accent transition-colors';

  return (
    <div className="space-y-2">
      {query.terms.length === 0 && (
        <p className="text-xs text-fg-dim">
          {t('No conditions yet — every event will match. Add a condition below to narrow it down.')}
        </p>
      )}

      {query.terms.map((term, i) => {
        const meta = attrMeta(term.attr);
        const kind: FilterAttrKind = meta?.kind ?? 'string';
        const opChoices = OPS_BY_KIND[kind];
        const knownAttr = (FILTER_ATTRS as readonly string[]).includes(term.attr);

        return (
          <div key={i} className="flex items-center gap-1.5 flex-wrap" data-testid="filter-term">
            {i === 0 ? (
              <span className="w-12 text-end text-xs text-fg-dim">
                {t('where')}
              </span>
            ) : (
              <select
                aria-label={t('Conjunction')}
                value={term.cnj === 'or' ? 'or' : 'and'}
                onChange={(e) => updateTerm(i, { cnj: e.target.value as FilterConjunction })}
                className="w-14 px-1 py-1 text-xs bg-surface border border-border-subtle rounded text-fg-muted focus:outline-none focus:border-accent transition-colors"
              >
                <option value="and">{t('and')}</option>
                <option value="or">{t('or')}</option>
              </select>
            )}

            <select
              aria-label={t('Open brackets')}
              value={bracketCount(term.obr)}
              onChange={(e) => updateTerm(i, { obr: e.target.value })}
              className="w-10 px-1 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-fg-muted focus:outline-none focus:border-accent transition-colors"
            >
              {BRACKET_CHOICES.map((n) => (
                <option key={n} value={n}>{n === 0 ? '(' : '('.repeat(n)}</option>
              ))}
            </select>

            <select
              aria-label={t('Attribute')}
              value={knownAttr ? term.attr : ''}
              onChange={(e) => {
                const attr = e.target.value as FilterAttr;
                const nextKind = attrMeta(attr)?.kind ?? 'string';
                const allowed = OPS_BY_KIND[nextKind];
                updateTerm(i, {
                  attr,
                  op: allowed.includes(term.op) ? term.op : allowed[0],
                  val: '',
                });
              }}
              className={select}
            >
              {!knownAttr && <option value="">{term.attr}</option>}
              <optgroup label={t('Event attributes')}>
                {PREVIEWABLE_ATTRS.map((a) => (
                  <option key={a} value={a}>{attrLabels[a]}</option>
                ))}
              </optgroup>
              <optgroup label={t('Server-side evaluation only')}>
                {SERVER_ONLY_ATTRS.map((a) => (
                  <option key={a} value={a}>{attrLabels[a]}</option>
                ))}
              </optgroup>
            </select>

            <select
              aria-label={t('Operator')}
              value={term.op}
              onChange={(e) => updateTerm(i, { op: e.target.value as FilterOp })}
              className={clsx(select, 'font-mono')}
            >
              {(opChoices.includes(term.op) ? opChoices : [term.op, ...opChoices]).map((op) => (
                <option key={op} value={op} title={opLabels[op]}>{op}</option>
              ))}
            </select>

            <ValueInput
              term={term}
              kind={kind}
              monitors={monitors}
              storage={storage}
              onChange={(val) => updateTerm(i, { val })}
            />

            <select
              aria-label={t('Close brackets')}
              value={bracketCount(term.cbr)}
              onChange={(e) => updateTerm(i, { cbr: e.target.value })}
              className="w-10 px-1 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-fg-muted focus:outline-none focus:border-accent transition-colors"
            >
              {BRACKET_CHOICES.map((n) => (
                <option key={n} value={n}>{n === 0 ? ')' : ')'.repeat(n)}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => removeTerm(i)}
              aria-label={t('Remove condition')}
              className="p-1 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addTerm}
        className={clsx(
          'flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed',
          'border-border-subtle text-fg-dim',
          'hover:border-border hover:text-fg transition-colors',
        )}
      >
        <Plus size={11} />
        {t('Add condition')}
      </button>
    </div>
  );
}

function ValueInput({
  term, kind, monitors, storage, onChange,
}: {
  term: FilterTerm;
  kind: FilterAttrKind;
  monitors: Monitor[];
  storage: ZmStorage[];
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const weekdays = useWeekdayLabels();
  const cls = 'flex-1 min-w-[8rem] px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent transition-colors';
  const value = term.val == null ? '' : String(term.val);
  const label = t('Value');

  // Legacy `Filter::is_isnot_opTypes()` restricts the value to NULL / 0 / 1.
  if (term.op === 'IS' || term.op === 'IS NOT') {
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="NULL">{t('NULL (unspecified)')}</option>
        <option value="0">{t('Zero')}</option>
        <option value="1">{t('Default / set')}</option>
      </select>
    );
  }
  if (term.op === '=[]' || term.op === '![]') {
    return (
      <input
        type="text"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('comma,separated,list')}
        className={cls}
      />
    );
  }
  if (kind === 'monitor' || kind === 'monitorName') {
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">{t('— select —')}</option>
        {monitors.map((m) => (
          <option key={m.id} value={kind === 'monitor' ? String(m.id) : m.name}>{m.name}</option>
        ))}
      </select>
    );
  }
  if (kind === 'storage') {
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">{t('NULL (unspecified)')}</option>
        <option value="0">{t('Zero')}</option>
        {storage.map((s) => (
          <option key={s.id} value={String(s.id)}>{s.name}</option>
        ))}
      </select>
    );
  }
  if (kind === 'bool') {
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">{t('All')}</option>
        <option value="0">{t('No')}</option>
        <option value="1">{t('Yes')}</option>
      </select>
    );
  }
  if (kind === 'weekday') {
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">{t('— select —')}</option>
        {weekdays.map((d, i) => (
          <option key={d} value={String(i)}>{d}</option>
        ))}
      </select>
    );
  }
  if (kind === 'datetime') {
    return (
      <input
        type="text"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('YYYY-MM-DD HH:MM:SS or -1 day')}
        className={clsx(cls, 'font-mono')}
      />
    );
  }
  if (kind === 'date') {
    return (
      <input type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
    );
  }
  if (kind === 'time') {
    return (
      <input type="time" step={1} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
    );
  }
  if (kind === 'number') {
    return (
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={cls}
      />
    );
  }
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('value')}
      className={cls}
    />
  );
}
