import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import type { ZmConfig } from '@/types';
import { enumOptionsFromHint, humanizeIdent } from './configFormat';

interface Props {
  config: ZmConfig;
  value: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function TypedConfigInput({ config, value, onChange, onCommit, onCancel, autoFocus }: Props) {
  const { t } = useTranslation();
  const baseInput =
    'px-2 py-1 text-xs font-mono bg-panel border border-cyan/50 rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-cyan/30';

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onCommit && !(e.target instanceof HTMLTextAreaElement)) onCommit();
    if (e.key === 'Escape' && onCancel) onCancel();
  };

  // Pipe-separated enum: select dropdown
  const options = enumOptionsFromHint(config.hint);
  if (config.type === 'string' && options) {
    return (
      <select
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={clsx(baseInput, 'flex-1')}
      >
        {!options.includes(value) && <option value={value}>{value || t('(unset)')}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{humanizeIdent(o)}</option>
        ))}
      </select>
    );
  }

  switch (config.private === 1 ? 'password' : config.type) {
    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes'}
            onChange={(e) => onChange(e.target.checked ? '1' : '0')}
            autoFocus={autoFocus}
            className="w-4 h-4 rounded border-cyan/50 bg-panel text-cyan focus:ring-1 focus:ring-cyan/30"
          />
          <span className="text-xs font-mono text-text-secondary">
            {value === '1' ? t('enabled') : t('disabled')}
          </span>
        </label>
      );

    case 'integer':
      return (
        <input
          type="number"
          step={1}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={clsx(baseInput, 'flex-1')}
        />
      );

    case 'decimal':
      return (
        <input
          type="number"
          step="any"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={clsx(baseInput, 'flex-1')}
        />
      );

    case 'hexadecimal':
      return (
        <input
          type="text"
          inputMode="text"
          pattern="(0x)?[0-9A-Fa-f]+"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className={clsx(baseInput, 'flex-1')}
        />
      );

    case 'password':
      return (
        <input
          type="password"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="new-password"
          className={clsx(baseInput, 'flex-1')}
        />
      );

    case 'text':
      return (
        <textarea
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          className={clsx(baseInput, 'flex-1 font-mono')}
        />
      );

    case 'string':
    default:
      return (
        <input
          type="text"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={clsx(baseInput, 'flex-1')}
        />
      );
  }
}

