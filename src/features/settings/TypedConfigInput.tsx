import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import type { ZmConfig } from '@/types';
import { enumOptionsFromHint, humanizeIdent } from './configFormat';
import { configPickerOptions, type PickerOption } from './configPickers';

interface Props {
  config: ZmConfig;
  value: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Element id, so a `<label htmlFor>` can name the control. */
  id?: string;
  disabled?: boolean;
  /**
   * `legacy` draws the control the way `options.php:315-371` does: a bare
   * checkbox, radios for a choice of three or fewer, a five-row textarea.
   */
  variant?: 'modern' | 'legacy';
  /** Replaces the default (modern) input styling. */
  inputClassName?: string;
}

export function TypedConfigInput({
  config, value, onChange, onCommit, onCancel, autoFocus, id, disabled, variant = 'modern', inputClassName,
}: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const legacy = variant === 'legacy';
  // The accent border is the only colour here: it marks the row currently
  // being edited, which is a state, not decoration.
  const baseInput = inputClassName
    ?? 'px-2 py-1 text-xs font-mono bg-surface border border-accent rounded text-fg focus:outline-none';
  const common = { id, disabled, autoFocus };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onCommit && !(e.target instanceof HTMLTextAreaElement)) onCommit();
    if (e.key === 'Escape' && onCancel) onCancel();
  };

  // A list legacy builds on the server (time zones, languages, skins…),
  // else a pipe-separated hint. Booleans are checkboxes whatever the hint.
  const picker = configPickerOptions(config, t);
  const hinted = config.type === 'string' ? enumOptionsFromHint(config.hint) : null;
  const choices: PickerOption[] | null = picker
    ?? (hinted
      ? [
        ...(hinted.includes(value) ? [] : [{ value, label: value || t('(unset)') }]),
        ...hinted.map((o) => ({ value: o, label: legacy ? o : humanizeIdent(o) })),
      ]
      : null);

  if (config.type !== 'boolean' && choices) {
    if (legacy && choices.length <= 3) {
      return (
        <span role="radiogroup" id={id} className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
          {choices.map((o) => (
            <label key={o.value} className="inline-flex items-center gap-1 text-sm font-semibold">
              <input
                type="radio"
                name={config.name}
                value={o.value}
                checked={value === o.value}
                disabled={disabled}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          ))}
        </span>
      );
    }
    return (
      <select
        {...common}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={clsx(baseInput, 'flex-1')}
      >
        {choices.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  const secret = config.private === 1 || config.type === 'password';
  switch (secret ? 'password' : config.type) {
    case 'boolean': {
      const checked = value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
      const box = (
        <input
          {...common}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? '1' : '0')}
          className="w-4 h-4 accent-accent"
        />
      );
      if (legacy) return box;
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          {box}
          <span className="text-xs text-fg-muted">
            {value === '1' ? t('enabled') : t('disabled')}
          </span>
        </label>
      );
    }

    case 'integer':
      return (
        <input
          {...common}
          type="number"
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={clsx(baseInput, 'flex-1')}
        />
      );

    case 'decimal':
      return (
        <input
          {...common}
          type={legacy ? 'text' : 'number'}
          step={legacy ? undefined : 'any'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={clsx(baseInput, 'flex-1')}
        />
      );

    case 'hexadecimal':
      return (
        <input
          {...common}
          type="text"
          inputMode="text"
          pattern="(0x)?[0-9A-Fa-f]+"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className={clsx(baseInput, 'flex-1')}
        />
      );

    case 'password':
      // Masked, with a toggle to show it (`1adfe62a0`); `new-password` keeps the
      // browser from filling in a saved login, which a save would then store.
      return (
        <span className="inline-flex items-center gap-1 flex-1">
          <input
            {...common}
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="new-password"
            className={clsx(baseInput, 'flex-1')}
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? t('Hide value') : t('Show value')}
              aria-pressed={revealed}
              className="p-1 text-fg-dim hover:text-fg"
            >
              {revealed ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            </button>
          )}
        </span>
      );

    case 'text':
      return (
        <textarea
          {...common}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={legacy ? 5 : 3}
          cols={legacy ? 40 : undefined}
          className={clsx(baseInput, 'flex-1 font-mono')}
        />
      );

    case 'string':
    default:
      return (
        <input
          {...common}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={clsx(baseInput, 'flex-1')}
        />
      );
  }
}
