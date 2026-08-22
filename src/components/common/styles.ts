/**
 * Shared class recipes for the primitives in this folder.
 *
 * Kept out of the component files so `react-refresh/only-export-components`
 * stays happy, and so a page that cannot use a primitive yet (a native
 * `<input>` inside a form library, say) can still borrow the exact same look.
 *
 * Everything here is expressed in semantic tokens (`bg-surface`, `text-fg`,
 * `border-border-subtle`, `bg-accent`…), so a primitive renders correctly in
 * modern light, modern dark and classic without asking which skin it is in.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md';
export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info';

/** Focus is handled by the base `:focus-visible` rule in `src/index.css`. */
const CONTROL_BASE =
  'inline-flex items-center justify-center gap-2 rounded font-medium ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export const buttonSize: Record<ControlSize, string> = {
  sm: 'px-2.5 py-1.5 text-label',
  md: 'px-4 py-2 text-sm',
};

export const buttonVariant: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-dim',
  secondary:
    'bg-surface-2 border border-border-subtle text-fg-muted hover:text-fg hover:border-border',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-danger-fg hover:bg-danger-dim',
};

export function buttonClasses(variant: ButtonVariant, size: ControlSize): string {
  return `${CONTROL_BASE} ${buttonSize[size]} ${buttonVariant[variant]}`;
}

/** Square icon-only button, sized to stay a comfortable hit target. */
export const iconButtonSize: Record<ControlSize, string> = {
  sm: 'p-1.5',
  md: 'p-2',
};

export function iconButtonClasses(variant: ButtonVariant, size: ControlSize): string {
  return `${CONTROL_BASE} ${iconButtonSize[size]} ${buttonVariant[variant]}`;
}

/** Text input, select and textarea share one field recipe. */
export const fieldSize: Record<ControlSize, string> = {
  sm: 'px-2 py-1 text-label',
  md: 'px-3 py-2 text-sm',
};

export const FIELD_BASE =
  'w-full rounded bg-surface border border-border-subtle text-fg ' +
  'placeholder:text-fg-faint transition-colors ' +
  'hover:border-border disabled:opacity-50 disabled:cursor-not-allowed';

export const FIELD_INVALID = 'border-danger hover:border-danger';

export function fieldClasses(size: ControlSize, invalid = false): string {
  return `${FIELD_BASE} ${fieldSize[size]}${invalid ? ` ${FIELD_INVALID}` : ''}`;
}

/**
 * Data label (M-5). 12px and normal weight instead of the 10px uppercase
 * letter-spaced mono the theme used to reach for; `--fg-dim` is the weakest
 * foreground that still clears 4.5:1 on every surface.
 */
export const LABEL = 'text-label text-fg-dim';

/** Tone → text colour, for badges, chips and status text. */
export const toneText: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  accent: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
};

/**
 * Tone → tinted pill. The tint is a 12% wash of the intent colour, so the
 * text on it is still the AA-checked `--<intent>` on `--surface` pair rather
 * than an untested foreground-on-fill combination.
 */
export const toneTint: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted border-border-subtle',
  accent: 'bg-accent/12 text-accent border-accent/30',
  ok: 'bg-ok/12 text-ok border-ok/30',
  warn: 'bg-warn/12 text-warn border-warn/30',
  danger: 'bg-danger/12 text-danger border-danger/30',
  info: 'bg-info/12 text-info border-info/30',
};
