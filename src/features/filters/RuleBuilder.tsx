import { clsx } from 'clsx';
import { Plus, X } from 'lucide-react';
import type {
  FilterQuery, FilterRule, FilterField, FilterOperator, FilterConjunction,
} from '@/api/filters';
import { FILTER_OPERATOR_LABELS } from '@/api/filters';
import type { Monitor } from '@/types';

interface RuleBuilderProps {
  query: FilterQuery;
  monitors: Monitor[];
  onChange: (q: FilterQuery) => void;
}

const FIELDS: Array<{ value: FilterField; label: string; kind: 'string' | 'number' | 'monitor' | 'bool' | 'date' }> = [
  { value: 'monitor_id',      label: 'Monitor',         kind: 'monitor' },
  { value: 'cause',           label: 'Cause',           kind: 'string' },
  { value: 'archived',        label: 'Archived',        kind: 'bool' },
  { value: 'name',            label: 'Name',            kind: 'string' },
  { value: 'notes',           label: 'Notes',           kind: 'string' },
  { value: 'max_score',       label: 'Max score',       kind: 'number' },
  { value: 'avg_score',       label: 'Avg score',       kind: 'number' },
  { value: 'tot_score',       label: 'Total score',     kind: 'number' },
  { value: 'alarm_frames',    label: 'Alarm frames',    kind: 'number' },
  { value: 'start_date_time', label: 'Start date/time', kind: 'date' },
];

/**
 * Per-field-kind operator menu. Mirrors legacy `Filter::opTypes()` but pruned
 * to only the operators that make sense for the given column type. The full
 * legacy set is exposed for string fields; numeric fields drop the regex /
 * LIKE family; date fields restrict to comparison + IS NULL.
 *
 * `contains` / `starts` / `ends` are dashboard-native string operators we
 * keep for back-compat with filters saved before P19. New rules default to
 * the legacy tokens (`LIKE` etc.).
 */
const OPERATORS: Record<string, FilterOperator[]> = {
  string:  [
    '=', '!=', '=~', '!~', '=[]', '![]', 'LIKE', 'NOT LIKE',
    'IS', 'IS NOT', 'contains', 'starts', 'ends',
  ],
  number:  ['=', '!=', '>', '>=', '<', '<=', '=[]', '![]', 'IS', 'IS NOT'],
  monitor: ['=', '!=', '=[]', '![]'],
  bool:    ['=', 'IS', 'IS NOT'],
  date:    ['=', '!=', '>', '>=', '<', '<=', 'IS', 'IS NOT'],
};

const BRACKET_CHOICES = [0, 1, 2, 3];

/**
 * Visual rule-row builder. Each row is
 *   `[(] [cnj] [field] [op] [value] [)] [remove]`.
 * The conjunction column is hidden on the first row — it would be meaningless.
 * The bracket selects let operators group rules with classic precedence,
 * e.g. `(rule AND rule) OR (rule AND rule)`. Selecting `0` (the default)
 * inserts no parens — the row reads as a flat conjunction with its neighbours.
 */
export function RuleBuilder({ query, monitors, onChange }: RuleBuilderProps) {
  const updateRule = (idx: number, patch: Partial<FilterRule>) => {
    const next = [...query.rules];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...query, rules: next });
  };

  const removeRule = (idx: number) => {
    onChange({ ...query, rules: query.rules.filter((_, i) => i !== idx) });
  };

  const addRule = () => {
    const next: FilterRule = {
      field: 'monitor_id',
      operator: '=',
      value: monitors[0] ? String(monitors[0].id) : '',
      conjunction: 'and',
      bracket_open: 0,
      bracket_close: 0,
    };
    onChange({ ...query, rules: [...query.rules, next] });
  };

  return (
    <div className="space-y-2">
      {query.rules.length === 0 && (
        <p className="text-xs text-text-muted italic">
          No rules yet — every event will match. Add a rule below to narrow it down.
        </p>
      )}

      {query.rules.map((rule, i) => {
        const fieldMeta = FIELDS.find((f) => f.value === rule.field) ?? FIELDS[0];
        const opChoices = OPERATORS[fieldMeta.kind];

        return (
          <div key={i} className="flex items-center gap-1.5 flex-wrap">
            {/* Conjunction (hidden on first row — no preceding rule to join) */}
            {i === 0 ? (
              <span className="text-[10px] font-mono uppercase text-text-muted w-12 text-right">
                where
              </span>
            ) : (
              <select
                value={rule.conjunction}
                onChange={(e) => updateRule(i, { conjunction: e.target.value as FilterConjunction })}
                className="w-12 px-1 py-1 text-[10px] font-mono uppercase bg-surface border border-border-subtle rounded text-cyan focus:outline-none focus:border-cyan/50"
              >
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
            )}

            {/* Open bracket — number of `(` inserted before this rule */}
            <select
              aria-label="Open brackets"
              value={rule.bracket_open ?? 0}
              onChange={(e) => updateRule(i, { bracket_open: Number(e.target.value) })}
              className="w-10 px-1 py-1 text-[10px] font-mono bg-surface border border-border-subtle rounded text-text-secondary focus:outline-none focus:border-cyan/50"
            >
              {BRACKET_CHOICES.map((n) => (
                <option key={n} value={n}>{n === 0 ? '(' : '('.repeat(n)}</option>
              ))}
            </select>

            {/* Field */}
            <select
              value={rule.field}
              onChange={(e) => {
                const newField = e.target.value as FilterField;
                const newKind = FIELDS.find((f) => f.value === newField)?.kind ?? 'string';
                const allowedOps = OPERATORS[newKind];
                updateRule(i, {
                  field: newField,
                  operator: allowedOps.includes(rule.operator) ? rule.operator : allowedOps[0],
                  value: '',
                });
              }}
              className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            >
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            {/* Operator */}
            <select
              value={rule.operator}
              onChange={(e) => updateRule(i, { operator: e.target.value as FilterOperator })}
              className="px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            >
              {opChoices.map((op) => (
                <option key={op} value={op} title={FILTER_OPERATOR_LABELS[op]}>{op}</option>
              ))}
            </select>

            {/* Value */}
            <ValueInput
              rule={rule}
              kind={fieldMeta.kind}
              monitors={monitors}
              onChange={(value) => updateRule(i, { value })}
            />

            {/* Close bracket — number of `)` after this rule */}
            <select
              aria-label="Close brackets"
              value={rule.bracket_close ?? 0}
              onChange={(e) => updateRule(i, { bracket_close: Number(e.target.value) })}
              className="w-10 px-1 py-1 text-[10px] font-mono bg-surface border border-border-subtle rounded text-text-secondary focus:outline-none focus:border-cyan/50"
            >
              {BRACKET_CHOICES.map((n) => (
                <option key={n} value={n}>{n === 0 ? ')' : ')'.repeat(n)}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => removeRule(i)}
              aria-label="Remove rule"
              className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRule}
        className={clsx(
          'flex items-center gap-1 px-2 py-1 text-[11px] rounded border-2 border-dashed',
          'border-border-subtle text-text-muted',
          'hover:border-cyan/40 hover:text-cyan transition-colors',
        )}
      >
        <Plus size={11} />
        Add rule
      </button>
    </div>
  );
}

function ValueInput({
  rule, kind, monitors, onChange,
}: {
  rule: FilterRule;
  kind: 'string' | 'number' | 'monitor' | 'bool' | 'date';
  monitors: Monitor[];
  onChange: (v: string) => void;
}) {
  const cls = 'flex-1 min-w-[8rem] px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50';

  // IS / IS NOT have a restricted value set in legacy (`Filter::is_isnot_opTypes()`).
  // Honour that to keep filters loaded from the legacy backend predictable.
  if (rule.operator === 'IS' || rule.operator === 'IS NOT') {
    return (
      <select value={rule.value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="NULL">NULL (unspecified)</option>
        <option value="0">Zero</option>
        <option value="1">Default / set</option>
      </select>
    );
  }

  // IN / NOT IN — free text but the runtime semantics are comma-separated.
  if (rule.operator === '=[]' || rule.operator === '![]') {
    return (
      <input
        type="text"
        value={rule.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="comma,separated,list"
        className={cls}
      />
    );
  }

  if (kind === 'monitor') {
    return (
      <select value={rule.value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">— select —</option>
        {monitors.map((m) => (
          <option key={m.id} value={String(m.id)}>{m.name}</option>
        ))}
      </select>
    );
  }
  if (kind === 'bool') {
    return (
      <select value={rule.value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">— select —</option>
        <option value="1">Yes</option>
        <option value="0">No</option>
      </select>
    );
  }
  if (kind === 'date') {
    return (
      <input
        type="datetime-local"
        value={rule.value}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      />
    );
  }
  if (kind === 'number') {
    return (
      <input
        type="number"
        value={rule.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={cls}
      />
    );
  }
  return (
    <input
      type="text"
      value={rule.value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className={cls}
    />
  );
}
