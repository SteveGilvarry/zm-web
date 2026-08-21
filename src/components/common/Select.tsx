import { clsx } from 'clsx';
import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react';
import { fieldClasses, LABEL, type ControlSize } from './styles';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: ControlSize;
  ref?: Ref<HTMLSelectElement>;
}

/** Labelled native select — native so it stays usable on touch and with a
 *  screen reader, and so the OS honours `color-scheme` for the popup. */
export function Select({
  label,
  hint,
  error,
  size = 'md',
  className,
  id,
  children,
  ref,
  ...rest
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={selectId} className={LABEL}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={clsx(hintId, errorId) || undefined}
        className={fieldClasses(size, Boolean(error))}
        {...rest}
      >
        {children}
      </select>
      {hint && !error && (
        <p id={hintId} className="text-label text-fg-dim">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-label text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
