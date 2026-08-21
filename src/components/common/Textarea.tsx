import { clsx } from 'clsx';
import { useId, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { fieldClasses, LABEL, type ControlSize } from './styles';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldSize?: ControlSize;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Labelled multi-line input. `fieldSize` rather than `size` because
 *  `<textarea>` already has a `cols`-adjacent `size`-shaped API. */
export function Textarea({
  label,
  hint,
  error,
  fieldSize = 'md',
  className,
  id,
  rows = 3,
  ref,
  ...rest
}: TextareaProps) {
  const generated = useId();
  const areaId = id ?? generated;
  const hintId = hint ? `${areaId}-hint` : undefined;
  const errorId = error ? `${areaId}-error` : undefined;

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={areaId} className={LABEL}>
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        ref={ref}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={clsx(hintId, errorId) || undefined}
        className={fieldClasses(fieldSize, Boolean(error))}
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
