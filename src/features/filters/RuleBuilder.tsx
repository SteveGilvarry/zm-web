import { clsx } from 'clsx';
import { Plus, X } from 'lucide-react';
import type {
  FilterQuery, FilterRule, FilterField, FilterOperator, FilterConjunction,
} from '@/api/filters';
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

const OPERATORS: Record<string, FilterOperator[]> = {
  string:  ['=', '!=', 'contains', 'starts', 'ends'],
  number:  ['=', '!=', '>', '<'],
  monitor: ['=', '!='],
  bool:    ['='],
  date:    ['=', '>', '<'],
};

/**
 * Visual rule-row builder. Each row is `[conjunction] [field] [op] [value]
 * [remove]`. The conjunction column is hidden on the first row — it would be
 * meaningless. Adding a row appends with the same kind of value picker the
 * field implies (monitor picker, boolean toggle, date input, free text).
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
          <div key={i} className="flex items-center gap-1.5">
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
                <option key={op} value={op}>{op}</option>
              ))}
            </select>

            {/* Value */}
            <ValueInput
              rule={rule}
              kind={fieldMeta.kind}
              monitors={monitors}
              onChange={(value) => updateRule(i, { value })}
            />

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
  const cls = 'flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50';

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
