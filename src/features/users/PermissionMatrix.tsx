import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import type { PermissionMatrixRow } from './permissions';

interface PermissionMatrixProps {
  /**
   * Rows × columns of radio inputs. Each row may have its own option set
   * — this lets us reuse the same component for the global 3/4-level grid
   * and the per-group / per-monitor `Inherit` grid.
   */
  rows: PermissionMatrixRow[];
  /** When `true`, all radios are disabled (read-only display). */
  readOnly?: boolean;
  /**
   * Called with `(rowKey, newLevel)` when the user changes a radio. Not
   * called when `readOnly` is true.
   */
  onChange?: (rowKey: string, level: string) => void;
  /** Optional column header label for the trailing column. */
  trailingHeader?: string;
  /** Header label shown above the row label column. */
  rowHeader?: string;
}

/**
 * Generic permission grid: rows on the left, level radios across the
 * columns. Used three times in the user editor (global, per-group,
 * per-monitor). The component is presentation-only — load + save are
 * the parent's responsibility.
 */
export function PermissionMatrix({
  rows,
  readOnly = false,
  onChange,
  trailingHeader,
  rowHeader,
}: PermissionMatrixProps) {
  const { t } = useTranslation();
  const levelLabel = useLevelLabel();
  // Compute the union of all options across rows so we can render a
  // stable column for each — rows with a smaller option set will just
  // show a placeholder dash in the missing column.
  const allOptions: string[] = [];
  for (const row of rows) {
    for (const opt of row.options) {
      if (!allOptions.includes(opt)) allOptions.push(opt);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-start">
            <th className="px-3 py-1.5 font-medium text-fg-dim text-start">{rowHeader ?? t('Permission')}</th>
            {allOptions.map((opt) => (
              <th key={opt} className="px-3 py-1.5 font-medium text-fg-dim text-center">
                {levelLabel(opt)}
              </th>
            ))}
            {trailingHeader && (
              <th className="px-3 py-1.5 font-medium text-fg-dim text-start">{trailingHeader}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-surface-2 transition-colors">
              <td
                className="px-3 py-1.5 align-top"
                data-depth={row.depth}
                style={row.depth ? { paddingInlineStart: `${0.75 + row.depth * 1.25}rem` } : undefined}
              >
                <div className="text-fg font-medium">
                  {row.depth ? <span aria-hidden className="text-fg-dim me-1">↳</span> : null}
                  {row.label}
                </div>
                {row.sublabel && (
                  <div className="text-xs text-fg-dim mt-0.5">{row.sublabel}</div>
                )}
              </td>
              {allOptions.map((opt) => {
                const available = row.options.includes(opt);
                const checked = row.value === opt;
                if (!available) {
                  return (
                    <td key={opt} className="px-3 py-1.5 text-center text-fg-faint">
                      —
                    </td>
                  );
                }
                return (
                  <td key={opt} className="px-3 py-1.5 text-center">
                    <label
                      className={clsx(
                        'inline-flex items-center justify-center',
                        readOnly && 'cursor-default opacity-80',
                        !readOnly && 'cursor-pointer',
                      )}
                    >
                      <input
                        type="radio"
                        name={`perm-${row.key}`}
                        aria-label={t('{{label}}: {{level}}', { label: row.label, level: levelLabel(opt) })}
                        value={opt}
                        checked={checked}
                        disabled={readOnly}
                        onChange={() => onChange?.(row.key, opt)}
                        className="accent-accent w-4 h-4"
                      />
                    </label>
                  </td>
                );
              })}
              {trailingHeader && (
                <td className="px-3 py-1.5 align-top text-fg-muted">{row.trailing ?? null}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Display label for a permission level. The wire values (`None`, `View`,
 * `Edit`, `Create`, `Inherit`) stay English; only what the operator sees
 * is translated.
 */
function useLevelLabel(): (level: string) => string {
  const { t } = useTranslation();
  return (level) => {
    switch (level) {
      case 'None': return t('None');
      case 'View': return t('View');
      case 'Edit': return t('Edit');
      case 'Create': return t('Create');
      case 'Inherit': return t('Inherit');
      default: return level;
    }
  };
}
