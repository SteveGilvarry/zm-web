import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Lock, Loader2, RotateCcw, Save } from 'lucide-react';
import { TypedConfigInput } from '@/features/settings/TypedConfigInput';
import { configDefaultValue, formatConfigValue, isAtDefault } from '@/features/settings/configFormat';
import type { ZmConfig } from '@/types';

export function ConfigRow({
  config,
  isEditing,
  editValue,
  editError = null,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  onReset,
  isSaving,
  dirtyValue,
}: {
  config: ZmConfig;
  isEditing: boolean;
  editValue: string;
  /** Pattern-validation message for the value being edited; blocks Save. */
  editError?: string | null;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** Write `default_value` back. Omit to hide the reset control. */
  onReset?: () => void;
  isSaving: boolean;
  /** A value typed but not yet written (see "Save all"); shown in place of the stored one. */
  dirtyValue?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isReadonly = config.readonly === 1;
  // `private` rows (ZM_AUTH_HASH_SECRET, reCAPTCHA keys) and password-typed rows never render their value.
  const isSecret = config.private === 1 || config.type === 'password';
  const canReset = !!onReset && !isReadonly && !isAtDefault(config);
  const defaultValue = configDefaultValue(config);

  return (
    <>
      <tr className="group hover:bg-panel/50 transition-colors">
        <td className="px-4 py-2.5 align-top">
          <div className="flex items-center gap-2">
            {config.help && (
              <button
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? t('Hide help') : t('Show help')}
                aria-expanded={expanded}
                className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} className="rtl:-scale-x-100" />}
              </button>
            )}
            {!config.help && <span className="w-3" />}
            <span className="font-mono text-text-primary text-xs">{config.name}</span>
            {isReadonly && <Lock size={11} className="text-text-muted flex-shrink-0" aria-label={t('Read-only')} />}
          </div>
          {config.prompt && (
            <p className="ps-5 mt-0.5 text-[11px] leading-snug text-text-muted">{config.prompt}</p>
          )}
        </td>
        <td className="px-4 py-2.5 align-top">
          {isEditing ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TypedConfigInput
                  config={config}
                  value={editValue}
                  onChange={onEditValueChange}
                  onCommit={onSave}
                  onCancel={onCancel}
                  autoFocus
                />
                <button
                  onClick={onSave}
                  disabled={isSaving || !!editError}
                  aria-label={t('Save')}
                  className="p-1 rounded text-cyan hover:bg-cyan/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                </button>
              </div>
              {editError && (
                <p role="alert" className="text-[11px] text-crimson">{editError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                onClick={isReadonly ? undefined : onStartEdit}
                className={clsx(
                  'text-xs font-mono block truncate max-w-[400px]',
                  isReadonly
                    ? 'text-text-muted'
                    : 'text-text-secondary cursor-pointer hover:text-cyan transition-colors'
                )}
                title={isSecret ? undefined : (dirtyValue ?? config.value)}
              >
                {dirtyValue !== undefined
                  ? (isSecret ? '••••••••' : formatConfigValue({ ...config, value: dirtyValue }))
                  : config.value
                    ? (isSecret ? '••••••••' : formatConfigValue(config))
                    : <span className="italic text-text-muted">{t('empty')}</span>}
              </span>
              {dirtyValue !== undefined && (
                <span className="text-[10px] px-1 rounded bg-amber/15 text-amber" title={t('Unsaved')}>{t('unsaved')}</span>
              )}
              {canReset && (
                <button
                  onClick={onReset}
                  disabled={isSaving}
                  aria-label={t('Reset {{name}} to default', { name: config.name })}
                  title={t('Reset to default ({{value}})', { value: isSecret ? '••••' : defaultValue })}
                  className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber hover:bg-amber/10 transition-all"
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
      {expanded && config.help && (
        <tr>
          <td colSpan={2} className="px-4 py-2 bg-panel/30">
            <p className="text-xs text-text-muted ps-5 whitespace-pre-line">{config.help.trim()}</p>
          </td>
        </tr>
      )}
    </>
  );
}
