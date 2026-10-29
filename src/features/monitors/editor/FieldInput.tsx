import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Shuffle } from 'lucide-react';
import { listControls } from '@/api/controls';
import { fieldClasses } from '@/components/common/styles';
import { RESOLUTION_PRESETS, type FieldDef, type FieldValue } from './fields';
import {
  ManufacturerSelect, ModelSelect, StorageSelect, ServerSelect, ReturnLocationSelect, LinkedMonitorsSelect, UserSelect,
} from './RelationSelects';
import { randomHexColour, HEX_COLOUR, storedOnly } from './editorState';
import { estimatedRamUse } from './classicFields';
import { AudioLevelMeter } from './AudioLevelMeter';
import { EncoderTemplatePicker } from './EncoderTemplatePicker';

/**
 * One editor field's input, by `kind`. Shared by both skins' editors:
 * `inputClass` swaps the field recipe (classic passes its Bootstrap-flat
 * one), the behaviour stays the same.
 */
export function FieldInput({
  field,
  monitorId,
  draft,
  value,
  stored,
  invalid,
  locked = false,
  inputClass,
  buttonClass,
  onChange,
  onUpdate,
}: {
  field: FieldDef;
  monitorId: number;
  draft: Record<string, FieldValue>;
  value: FieldValue;
  stored?: FieldValue;
  invalid: boolean;
  /** The user lacks `field.requires`: render read-only with the reason as tooltip. */
  locked?: boolean;
  /** Field recipe; defaults to the modern one. */
  inputClass?: (invalid: boolean) => string;
  /** Button recipe for in-field buttons (Apply template); defaults to the modern one. */
  buttonClass?: string;
  onChange: (v: FieldValue) => void;
  onUpdate: (key: string, value: FieldValue) => void;
}) {
  const { t } = useTranslation();
  const recipe = inputClass ?? ((bad: boolean) => fieldClasses('sm', bad));
  if (locked) {
    return (
      <input
        type="text"
        readOnly
        value={value == null ? '' : String(value)}
        title={field.requires?.reason}
        aria-label={field.label}
        className={clsx(recipe(false), 'cursor-not-allowed opacity-70')}
      />
    );
  }
  // Focus comes from the base `:focus-visible` rule in src/index.css, so this
  // is the shared field recipe with nothing bolted on.
  const baseInput = recipe(invalid);

  if (field.kind === 'textarea') {
    return (
      <textarea
        rows={field.rows ? field.rows(value) : 3}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-invalid={invalid || undefined}
        className={clsx(baseInput, 'font-mono text-xs leading-relaxed resize-y')}
      />
    );
  }

  if (field.kind === 'number') {
    return (
      <input
        type="number"
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        min={field.min}
        max={field.max}
        step={field.integer ? 1 : 'any'}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-invalid={invalid || undefined}
        className={clsx(baseInput, 'font-mono tabular-nums')}
      />
    );
  }

  if (field.kind === 'toggle') {
    // Backend stores booleans as 0/1 ints.
    const on = Number(value) === 1;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? 0 : 1)}
        className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium transition-colors',
          on
            ? 'border-accent/30 bg-accent/12 text-accent'
            : 'border-border-subtle bg-surface text-fg-dim hover:border-border hover:text-fg',
        )}
      >
        <span
          className={clsx(
            'w-6 h-3 rounded-full p-0.5 flex items-center transition-colors',
            on ? 'bg-accent/40 justify-end' : 'bg-fg-dim/40 justify-start',
          )}
        >
          <span className="w-2 h-2 rounded-full bg-surface" />
        </span>
        {on ? t('Enabled') : t('Disabled')}
      </button>
    );
  }

  if (field.kind === 'triggers') {
    // X10 is the only trigger ZoneMinder has, and X10 is not built.
    return <em className="text-sm">{t('None available')}</em>;
  }

  if (field.kind === 'ram-estimate') {
    const ram = estimatedRamUse(draft);
    return (
      <span data-testid="estimated-ram" className="text-sm font-mono tabular-nums">
        {ram ? `${t('Min')}: ${ram.min} ${t('Max')}: ${ram.max ?? t('Unlimited')}` : '—'}
      </span>
    );
  }

  if (field.kind === 'encoder-template') {
    return (
      <EncoderTemplatePicker
        encoder={draft.encoder}
        params={draft.encoder_parameters}
        onApply={(text) => onUpdate('encoder_parameters', text)}
        selectClass={baseInput}
        buttonClass={buttonClass}
      />
    );
  }

  if (field.kind === 'audio-level') {
    return <AudioLevelMeter monitorId={monitorId} threshold={draft.audio_threshold} />;
  }

  if (field.kind === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={Number(value) === 1}
        onChange={(e) => onChange(e.target.checked ? 1 : 0)}
        aria-label={field.label}
        className="accent-accent h-4 w-4 cursor-pointer"
      />
    );
  }

  if (field.kind === 'undelete') {
    // Checked = bring it back. Unchecked restores whatever was stored.
    return (
      <input
        type="checkbox"
        checked={stored != null && Number(value) === 0 && Number(stored) !== 0}
        onChange={(e) => onChange(e.target.checked ? 0 : stored ?? 1)}
        aria-label={field.label}
        className="accent-accent h-4 w-4 cursor-pointer"
      />
    );
  }

  if (field.kind === 'radio' && field.options) {
    const current = value == null ? '' : String(value);
    const choices = [
      ...field.options.map((o) => ({ value: String(o.value), label: o.label, raw: o.value as FieldValue })),
      ...(field.nullOption ? [{ value: '', label: field.nullOption, raw: null as FieldValue }] : []),
    ];
    return (
      <div role="radiogroup" aria-label={field.label} className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {choices.map((c) => (
          <label key={c.value} className="inline-flex items-center gap-1 text-sm cursor-pointer select-none">
            <input
              type="radio"
              name={`radio-${field.key}`}
              value={c.value}
              checked={current === c.value}
              onChange={() => onChange(c.raw)}
              className="accent-accent"
            />
            {c.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === 'select' && field.options) {
    // Coerce back to number when the option values are numeric — keeps the
    // PATCH body's types matching the backend schema (e.g. label_size:int,
    // return_location:int) instead of stringifying them.
    const current = value == null ? '' : String(value);
    const options = [...field.options, ...(storedOnly(field, stored) ? field.storedOnlyOptions! : [])]
      .filter((o) => !field.optionShown || field.optionShown(o.value, draft) || String(o.value) === current);
    const optionsAreNumeric = options.every((o) => typeof o.value === 'number');
    const known = options.some((o) => String(o.value) === current);
    return (
      <select
        value={current}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') { onChange(null); return; }
          onChange(optionsAreNumeric ? Number(raw) : raw);
        }}
        aria-label={field.label}
        aria-invalid={invalid || undefined}
        className={clsx(baseInput, 'cursor-pointer')}
      >
        {(field.nullOption || (!known && current === '')) && (
          <option value="">{field.nullOption ?? t('Not set')}</option>
        )}
        {options.map((o) => (
          <option
            key={String(o.value)}
            value={String(o.value)}
            disabled={field.disabledOption?.(o.value, draft) && String(o.value) !== current}
          >
            {o.label}
          </option>
        ))}
        {/* A stored value outside the legacy list stays selectable instead of snapping to the first option. */}
        {!known && current !== '' && <option value={current}>{current}</option>}
      </select>
    );
  }

  if (field.kind === 'color') {
    return <ColorInput value={value} onChange={onChange} className={baseInput} randomizable={field.key === 'web_colour'} />;
  }

  if (field.kind === 'resolution') {
    return (
      <ResolutionInput
        width={draft.width}
        height={draft.height}
        invalid={invalid}
        onChange={(w, h) => { onUpdate('width', w); onUpdate('height', h); }}
        className={baseInput}
      />
    );
  }

  if (field.kind === 'control-select') {
    return <ControlSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'storage-select') {
    return <StorageSelect value={value} onChange={onChange} className={baseInput} zeroOption={field.zeroOption} />;
  }
  if (field.kind === 'server-select') {
    return <ServerSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'manufacturer-select') {
    return <ManufacturerSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'model-select') {
    const mid = draft.manufacturer_id == null ? null : Number(draft.manufacturer_id);
    return <ModelSelect manufacturerId={mid} value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'return-location-select') {
    return <ReturnLocationSelect monitorId={monitorId} value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'user-select') {
    return <UserSelect value={value} onChange={onChange} className={baseInput} />;
  }
  if (field.kind === 'linked-monitors') {
    return <LinkedMonitorsSelect selfId={monitorId} value={value} onChange={onChange} className={baseInput} />;
  }

  if (field.kind === 'password') {
    return <PasswordInput value={value} onChange={onChange} label={field.label} className={baseInput} />;
  }

  // text
  return (
    <input
      type="text"
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      aria-label={field.label}
      aria-invalid={invalid || undefined}
      className={baseInput}
    />
  );
}


/* ------------------------------------------------------------------------ */
/*  Specialised inputs                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Password input with a visibility toggle. Mirrors the legacy ONVIF/source
 * password fields which ship with an eye icon — operators expect to be able
 * to verify what they're typing against the camera UI.
 *
 * The API never echoes a stored password, so an empty box is ambiguous:
 * the placeholder says the stored one is intact and typing replaces it.
 */
function PasswordInput({
  value,
  onChange,
  label,
  className,
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  label: string;
  className: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('Unchanged — type to replace')}
        aria-label={label}
        autoComplete="new-password"
        className={clsx(className, 'font-mono pe-9')}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('Hide password') : t('Show password')}
        className="absolute end-2 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg transition-colors"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

/**
 * Colour picker + editable text. ZoneMinder stores CSS colour strings, so
 * legacy rows can hold names (`red`); the picker only understands hex, so a
 * non-hex value shows as black in the swatch until the operator picks one.
 */
function ColorInput({
  value,
  onChange,
  className,
  randomizable,
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  className: string;
  randomizable?: boolean;
}) {
  const { t } = useTranslation();
  const text = value == null ? '' : String(value);
  const hex = HEX_COLOUR.test(text) ? text : '#000000';
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('Pick colour')}
        className="h-8 w-10 rounded border border-border-subtle bg-surface cursor-pointer p-0.5"
      />
      <input
        type="text"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#00d4ff"
        className={clsx(className, 'font-mono flex-1')}
      />
      {randomizable && (
        <button
          type="button"
          onClick={() => onChange(randomHexColour())}
          aria-label={t('Random colour')}
          title={t('Random colour')}
          className="p-1.5 rounded border border-border-subtle text-fg-dim hover:text-fg"
        >
          <Shuffle size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Width × height with the legacy resolution preset list and a "preserve
 * aspect" lock: with the lock on, editing one side recomputes the other
 * from the ratio the pair had when the lock was switched on.
 */
function ResolutionInput({
  width,
  height,
  invalid,
  onChange,
  className,
}: {
  width: FieldValue;
  height: FieldValue;
  invalid: boolean;
  onChange: (w: FieldValue, h: FieldValue) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const [ratio, setRatio] = useState<number | null>(null);
  const w = width == null ? '' : String(width);
  const h = height == null ? '' : String(height);
  const presetValue = w && h ? `${w}x${h}` : '';
  const inList = RESOLUTION_PRESETS.some((p) => `${p.width}x${p.height}` === presetValue);

  const setWidth = (raw: string) => {
    const nw = raw === '' ? null : Number(raw);
    if (ratio && nw) onChange(nw, Math.max(1, Math.round(nw / ratio)));
    else onChange(nw, height);
  };
  const setHeight = (raw: string) => {
    const nh = raw === '' ? null : Number(raw);
    if (ratio && nh) onChange(Math.max(1, Math.round(nh * ratio)), nh);
    else onChange(width, nh);
  };
  const toggleLock = () => {
    const nw = Number(width), nh = Number(height);
    setRatio(ratio ? null : nw > 0 && nh > 0 ? nw / nh : null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        step={1}
        value={w}
        onChange={(e) => setWidth(e.target.value)}
        aria-label={t('Width (px)')}
        aria-invalid={invalid || undefined}
        className={clsx(className, 'font-mono tabular-nums w-24 flex-none')}
      />
      <span className="text-fg-dim">×</span>
      <input
        type="number"
        min={1}
        step={1}
        value={h}
        onChange={(e) => setHeight(e.target.value)}
        aria-label={t('Height (px)')}
        aria-invalid={invalid || undefined}
        className={clsx(className, 'font-mono tabular-nums w-24 flex-none')}
      />
      <select
        value={inList ? presetValue : ''}
        onChange={(e) => {
          const [pw, ph] = e.target.value.split('x').map(Number);
          if (pw && ph) { setRatio(null); onChange(pw, ph); }
        }}
        aria-label={t('Resolution preset')}
        className={clsx(className, 'cursor-pointer flex-1 min-w-[10rem]')}
      >
        <option value="">{t('Custom')}</option>
        {RESOLUTION_PRESETS.map((p) => (
          <option key={p.label} value={`${p.width}x${p.height}`}>{p.label}</option>
        ))}
      </select>
      <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer select-none">
        <input type="checkbox" className="accent-accent" checked={ratio != null} onChange={toggleLock} />
        {t('Preserve aspect ratio')}
      </label>
    </div>
  );
}

/**
 * Control-type dropdown — sources options from /api/v3/controls. We
 * surface the friendly name in the option label, but the value is the
 * numeric control_id so PATCH bodies carry the right FK type.
 *
 * While the list is loading we still render the select but mark it as
 * disabled so the operator sees something rather than a blank gap. If the
 * fetch fails we surface a tiny error line under the field — the editor's
 * own save button stays enabled (the user might be backing out of an edit).
 */
function ControlSelect({
  value,
  onChange,
  className,
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['controls', { page_size: 200 }],
    queryFn: () => listControls({ page: 1, page_size: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const controls = data?.items ?? [];

  return (
    <div>
      <select
        value={value == null ? '0' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' || raw === '0' ? 0 : Number(raw));
        }}
        disabled={isLoading}
        className={clsx(className, 'cursor-pointer')}
      >
        <option value="0">{t('None')}</option>
        {controls.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.protocol ? ` (${c.protocol})` : ''}
          </option>
        ))}
      </select>
      {isError && (
        <p className="text-xs text-danger mt-1">
          {t('Could not load control list — save will still work if you don’t change this field.')}
        </p>
      )}
    </div>
  );
}
