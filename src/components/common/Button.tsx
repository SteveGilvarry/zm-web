import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, Ref } from 'react';
import {
  buttonClasses,
  iconButtonClasses,
  type ButtonVariant,
  type ControlSize,
} from './styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Square padding for a button whose only content is an icon. Pair with
   *  `aria-label` — an icon-only button has no accessible name otherwise. */
  icon?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The app's button. Four variants, two sizes, `type="button"` by default so
 * a button inside a form does not submit it by accident.
 *
 * Focus comes from the base `:focus-visible` rule in `src/index.css` — there
 * is deliberately no per-variant ring here, so every focusable thing in the
 * app draws the same one.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        icon ? iconButtonClasses(variant, size) : buttonClasses(variant, size),
        className,
      )}
      {...rest}
    />
  );
}
