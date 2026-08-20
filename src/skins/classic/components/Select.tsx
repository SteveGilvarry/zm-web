import type { ReactNode, SelectHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface ClassicSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ClassicSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label: ReactNode;
  options: ClassicSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Put the label above the control (filter-row style) instead of inline. */
  stacked?: boolean;
  selectClassName?: string;
}

/** Legacy `Width [auto ▼]` style labelled select. */
export function ClassicSelect({
  label,
  options,
  value,
  onChange,
  stacked = false,
  className,
  selectClassName,
  ...rest
}: ClassicSelectProps) {
  return (
    <label
      className={clsx(
        'text-sm text-zinc-800',
        stacked ? 'flex flex-col items-center gap-1' : 'inline-flex items-center gap-1.5',
        className,
      )}
    >
      <span className="font-semibold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'rounded-sm border border-zinc-400 bg-white px-1.5 py-0.5 text-sm font-normal text-zinc-900',
          'focus:outline-none focus:border-[#337ab7] focus:ring-1 focus:ring-[#337ab7]',
          selectClassName,
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Plain classic text input matching the select recipe. */
export const classicInputClass =
  'rounded-sm border border-zinc-400 bg-white px-2 py-0.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#337ab7] focus:ring-1 focus:ring-[#337ab7]';
