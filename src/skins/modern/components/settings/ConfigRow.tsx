import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Lock, Loader2, Save } from 'lucide-react';
import { TypedConfigInput } from '@/features/settings/TypedConfigInput';
import { formatConfigValue } from '@/features/settings/configFormat';
import type { ZmConfig } from '@/types';

export function ConfigRow({
  config,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  isSaving,
}: {
  config: ZmConfig;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isReadonly = config.readonly === 1;
  // `private` rows (ZM_AUTH_HASH_SECRET, reCAPTCHA keys) and password-typed rows never render their value.
  const isSecret = config.private === 1 || config.type === 'password';

  return (
    <>
      <tr className="group hover:bg-panel/50 transition-colors">
        <td className="px-4 py-2.5">
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
        </td>
        <td className="px-4 py-2.5">
          {isEditing ? (
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
                disabled={isSaving}
                aria-label={t('Save')}
                className="p-1 rounded text-cyan hover:bg-cyan/20 transition-colors"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              </button>
            </div>
          ) : (
            <span
              onClick={isReadonly ? undefined : onStartEdit}
              className={clsx(
                'text-xs font-mono block truncate max-w-[400px]',
                isReadonly
                  ? 'text-text-muted'
                  : 'text-text-secondary cursor-pointer hover:text-cyan transition-colors'
              )}
              title={isSecret ? undefined : config.value}
            >
              {config.value
                ? (isSecret ? '••••••••' : formatConfigValue(config))
                : <span className="italic text-text-muted">{t('empty')}</span>}
            </span>
          )}
        </td>
      </tr>
      {expanded && config.help && (
        <tr>
          <td colSpan={2} className="px-4 py-2 bg-panel/30">
            <p className="text-xs text-text-muted ps-5">{config.help}</p>
          </td>
        </tr>
      )}
    </>
  );
}
