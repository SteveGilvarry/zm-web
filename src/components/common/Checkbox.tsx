import { clsx } from 'clsx';
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Visible label text. Omit for a bare row-select box with an `aria-label`. */
  label?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Native checkbox with the app's accent colour. `accent-color` is what makes
 * the browser's own tick honour the theme, which keeps the control fully
 * native — nothing to re-implement for keyboard or screen readers.
 */
export function Checkbox({ label, className, id, ref, ...rest }: CheckboxProps) {
  const generated = useId();
  const boxId = id ?? generated;
  const input = (
    <input
      type="checkbox"
      id={boxId}
      ref={ref}
      className="w-4 h-4 rounded accent-accent border-border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      {...rest}
    />
  );
  if (!label) return <span className={className}>{input}</span>;
  return (
    <label
      htmlFor={boxId}
      className={clsx('inline-flex items-center gap-2 text-sm text-fg-muted cursor-pointer', className)}
    >
      {input}
      <span>{label}</span>
    </label>
  );
}
