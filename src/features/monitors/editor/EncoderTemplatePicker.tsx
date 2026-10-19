import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { buttonClasses } from '@/components/common/styles';
import { applyTemplateParams } from './encoderParams';
import { useEncoderTemplates } from './useEncoderTemplates';
import type { FieldValue } from './fields';

/**
 * Legacy Recording → Encoder Template (`monitor.php:1279`,
 * `monitor-encoder-templates.js`): the templates for the chosen encoder and
 * an Apply button that merges the picked one into Encoder Parameters (keys
 * already there take the template's value in place; new keys go on the end).
 *
 * Once a template has been picked or applied, switching encoder offers the
 * template of the same name for the new encoder, as legacy's
 * `onEncoderChange` does. The catalogue hides the row when the encoder has
 * no templates.
 */
export function EncoderTemplatePicker({
  encoder, params, onApply, selectClass, buttonClass,
}: {
  encoder: FieldValue | undefined;
  params: FieldValue | undefined;
  onApply: (text: string) => void;
  selectClass: string;
  buttonClass?: string;
}) {
  const { t } = useTranslation();
  const byEncoder = useEncoderTemplates();
  const enc = String(encoder ?? '');
  const templates = byEncoder.get(enc) ?? [];
  // The pick belongs to an encoder; another encoder starts on its first template.
  const [picked, setPicked] = useState<{ encoder: string; id: number } | null>(null);
  const selected = (picked?.encoder === enc && templates.find((x) => x.id === picked.id)) || templates[0];
  const lastName = useRef<string | null>(null);
  const merge = (text: string) => applyTemplateParams(params == null ? '' : String(params), text);

  const prevEncoder = useRef(enc);
  useEffect(() => {
    if (prevEncoder.current === enc) return;
    prevEncoder.current = enc;
    const name = lastName.current;
    const match = name ? templates.find((x) => x.name.toLowerCase() === name.toLowerCase()) : undefined;
    if (!match) return;
    if (window.confirm(t('You had "{{name}}" applied. Apply {{match}} for {{encoder}}?', { name, match: match.name, encoder: enc }))) {
      onApply(merge(match.params));
      lastName.current = match.name;
    }
    // Only an encoder change prompts; the other values are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enc]);

  if (!templates.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        value={String(selected.id)}
        onChange={(e) => {
          const id = Number(e.target.value);
          setPicked({ encoder: enc, id });
          lastName.current = templates.find((x) => x.id === id)?.name ?? null;
        }}
        aria-label={t('Encoder Template')}
        className={clsx(selectClass, 'cursor-pointer')}
      >
        {templates.map((tpl) => (
          <option key={tpl.id} value={tpl.id} title={tpl.description ?? undefined}>{tpl.name}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          onApply(merge(selected.params));
          lastName.current = selected.name;
        }}
        className={buttonClass ?? buttonClasses('secondary', 'sm')}
      >
        {t('Apply template')}
      </button>
    </span>
  );
}
