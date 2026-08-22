import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  CONTROL_TYPES,
  controlFieldLabel,
  type ControlField,
  type ControlFieldKey,
  type ControlFormValues,
} from './controlFields';

export interface ControlEditorClasses {
  /** Wrapper of one label + input pair. */
  row: string;
  label: string;
  input: string;
  select: string;
  checkbox: string;
}

interface ControlEditorFieldsProps {
  fields: readonly ControlField[];
  values: ControlFormValues;
  onChange: (key: ControlFieldKey, value: string | number | null) => void;
  onToggle: (key: ControlFieldKey) => void;
  disabled?: boolean;
  classes: ControlEditorClasses;
  /** Prefix for input ids so two editors on one page never collide. */
  idPrefix?: string;
}

/**
 * One tab's worth of the legacy `controlcap` form: label / control pairs
 * in legacy order. Presentation only — each skin passes its own classes.
 */
export function ControlEditorFields({
  fields, values, onChange, onToggle, disabled = false, classes, idPrefix = 'ctl',
}: ControlEditorFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const label = controlFieldLabel(t, f.key);
        const value = values[f.key];
        return (
          <div key={f.key} className={classes.row}>
            <label htmlFor={id} className={classes.label}>{label}</label>
            {f.kind === 'flag' ? (
              <input
                id={id}
                type="checkbox"
                checked={!!value}
                disabled={disabled}
                onChange={() => onToggle(f.key)}
                className={classes.checkbox}
              />
            ) : f.kind === 'type' ? (
              <select
                id={id}
                value={typeof value === 'string' ? value : ''}
                disabled={disabled}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={classes.select}
              >
                {CONTROL_TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
              </select>
            ) : f.kind === 'number' ? (
              <input
                id={id}
                type="number"
                step={1}
                inputMode="numeric"
                value={value == null ? '' : String(value)}
                disabled={disabled}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={clsx(classes.input, 'w-32')}
              />
            ) : (
              <input
                id={id}
                type="text"
                value={typeof value === 'string' ? value : ''}
                required={f.kind === 'text' && f.required}
                disabled={disabled}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={classes.input}
                placeholder={f.key === 'protocol' ? t('Driver module name, e.g. PelcoP') : undefined}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
