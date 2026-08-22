import { clsx } from 'clsx';
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { fieldClasses, LABEL, type ControlSize } from './styles';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label. Omit only when an `aria-label` supplies the name. */
  label?: ReactNode;
  /** Help text under the field; wired up via `aria-describedby`. */
  hint?: ReactNode;
  /** Error text under the field. Sets `aria-invalid` and the danger border. */
  error?: ReactNode;
  size?: ControlSize;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Labelled text input. The label is a real `<label for>`, so the field's
 * accessible name is its visible text and clicking the label focuses it.
 */
export function TextField({
  label,
  hint,
  error,
  size = 'md',
  className,
  id,
  ref,
  ...rest
}: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className={LABEL}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={clsx(hintId, errorId) || undefined}
        className={fieldClasses(size, Boolean(error))}
        {...rest}
      />
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
