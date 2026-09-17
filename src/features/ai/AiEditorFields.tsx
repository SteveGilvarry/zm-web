import { useTranslation } from 'react-i18next';

import { AI_FRAMEWORKS, type AiDataset } from '@/api/ai';
import type { AiSection } from '@/skins/types';
import type { AiDraft } from './useAiAdminPage';

export interface AiEditorClasses {
  /** Wrapper of one label + control pair. */
  row: string;
  label: string;
  input: string;
  select: string;
  checkbox: string;
}

interface AiEditorFieldsProps {
  section: AiSection;
  draft: AiDraft;
  datasets: readonly AiDataset[];
  onChange: <K extends keyof AiDraft>(key: K, value: AiDraft[K]) => void;
  disabled?: boolean;
  classes: AiEditorClasses;
  idPrefix?: string;
}

/**
 * The AI editor form — one section's fields in the column order its legacy
 * table uses (`_options_ai_*.php`). Presentation only: each skin passes its
 * own classes, exactly as `ControlEditorFields` does.
 */
export function AiEditorFields({
  section, draft, datasets, onChange, disabled = false, classes, idPrefix = 'ai',
}: AiEditorFieldsProps) {
  const { t } = useTranslation();
  const id = (key: string) => `${idPrefix}-${key}`;

  const text = (key: keyof AiDraft, label: string) => (
    <div className={classes.row} key={key}>
      <label htmlFor={id(key)} className={classes.label}>{label}</label>
      <input
        id={id(key)}
        type="text"
        value={String(draft[key] ?? '')}
        disabled={disabled}
        onChange={(e) => onChange(key, e.target.value as AiDraft[typeof key])}
        className={classes.input}
      />
    </div>
  );

  const number = (key: keyof AiDraft, label: string) => (
    <div className={classes.row} key={key}>
      <label htmlFor={id(key)} className={classes.label}>{label}</label>
      <input
        id={id(key)}
        type="number"
        step={1}
        min={0}
        inputMode="numeric"
        value={String(draft[key] ?? '')}
        disabled={disabled}
        onChange={(e) => onChange(key, e.target.value as AiDraft[typeof key])}
        className={classes.input}
      />
    </div>
  );

  const datasetSelect = (allowNone: boolean) => (
    <div className={classes.row} key="datasetId">
      <label htmlFor={id('datasetId')} className={classes.label}>{t('Dataset')}</label>
      <select
        id={id('datasetId')}
        value={draft.datasetId}
        disabled={disabled}
        onChange={(e) => onChange('datasetId', e.target.value)}
        className={classes.select}
      >
        {allowNone && <option value="">{t('None')}</option>}
        {datasets.map((d) => (
          <option key={d.id} value={String(d.id)}>{d.name}</option>
        ))}
      </select>
    </div>
  );

  if (section === 'datasets') {
    return (
      <>
        {text('name', t('Name'))}
        {text('version', t('Version'))}
        {number('numClasses', t('Number of Classes'))}
        {text('description', t('Description'))}
      </>
    );
  }

  if (section === 'models') {
    return (
      <>
        {text('name', t('Name'))}
        <div className={classes.row}>
          <label htmlFor={id('framework')} className={classes.label}>{t('Framework')}</label>
          <select
            id={id('framework')}
            value={draft.framework}
            disabled={disabled}
            onChange={(e) => onChange('framework', e.target.value)}
            className={classes.select}
          >
            {AI_FRAMEWORKS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {text('version', t('Version'))}
        {datasetSelect(true)}
        {text('modelPath', t('Model Path'))}
        <div className={classes.row}>
          <label htmlFor={id('enabled')} className={classes.label}>{t('Enabled')}</label>
          <input
            id={id('enabled')}
            type="checkbox"
            checked={draft.enabled}
            disabled={disabled}
            onChange={(e) => onChange('enabled', e.target.checked)}
            className={classes.checkbox}
          />
        </div>
        {text('description', t('Description'))}
      </>
    );
  }

  return (
    <>
      {datasetSelect(false)}
      {text('className', t('Class Name'))}
      {number('classIndex', t('Class Index'))}
      {text('description', t('Description'))}
    </>
  );
}
