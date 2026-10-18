import { useState, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { insertMidpoint, type Point } from '@/api/zones';
import { areaPercent, type ZoneAreaField, type ZoneEditorState } from './useZoneEditor';
import { clampFilterSize } from './zoneValidation';

/**
 * A number box whose shown text is derived from state, but which keeps what
 * the operator typed while it has focus — so typing "0.55" into a box that
 * rounds through pixels does not jump under the cursor.
 */
export function BufferedNumberInput({
  value, onValue, ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValue: (raw: string) => void;
}) {
  const [buffer, setBuffer] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="decimal"
      {...rest}
      value={buffer ?? value}
      onFocus={(e) => { setBuffer(value); rest.onFocus?.(e); }}
      onBlur={(e) => { setBuffer(null); rest.onBlur?.(e); }}
      onChange={(e) => {
        setBuffer(e.target.value);
        onValue(e.target.value);
      }}
    />
  );
}

/**
 * Legacy's mirrored pair for one area threshold (`zone.php:311`): the share
 * of the zone in percent, then the same figure in pixels. Either box drives
 * the other; the pixel figure is what is saved.
 */
export function AreaPair({ editor, field, label, inputClassName, suffixClassName, changed }: {
  editor: ZoneEditorState;
  field: ZoneAreaField;
  /** Accessible name of the pair, e.g. "Min/Max Alarmed Area (min)". */
  label: string;
  inputClassName?: string;
  suffixClassName?: string;
  changed?: boolean;
}) {
  const { t } = useTranslation();
  const { draft, enabled, zonePx } = editor;
  if (!draft || !enabled) return null;
  const disabled = !enabled[field];
  const px = draft.nums[field];
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <BufferedNumberInput
        aria-label={t('{{label}} (%)', { label })}
        value={areaPercent(px, zonePx)}
        onValue={(raw) => editor.setAreaPercent(field, raw)}
        min={0}
        max={100}
        step="any"
        disabled={disabled}
        className={clsx(inputClassName, changed && 'ring-1 ring-ok')}
      />
      <span className={suffixClassName}>%</span>
      <input
        type="number"
        inputMode="numeric"
        aria-label={t('{{label}} (px)', { label })}
        value={px}
        onChange={(e) => editor.setAreaPixels(field, e.target.value)}
        min={0}
        max={zonePx > 0 ? zonePx : undefined}
        step={1}
        disabled={disabled}
        className={clsx(inputClassName, changed && 'ring-1 ring-ok')}
      />
      <span className={suffixClassName}>{t('px')}</span>
    </span>
  );
}

/** The filter box: legacy's `limitFilter` (odd, 3–15), applied on leaving it. */
export function FilterSizeInput({ editor, field, label, className, changed }: {
  editor: ZoneEditorState;
  field: 'filter_x' | 'filter_y';
  label: string;
  className?: string;
  changed?: boolean;
}) {
  const { draft, enabled } = editor;
  if (!draft || !enabled) return null;
  return (
    <input
      type="number"
      inputMode="numeric"
      min={3}
      max={15}
      step={2}
      aria-label={label}
      value={draft.nums[field]}
      disabled={!enabled[field]}
      onChange={(e) => editor.setNum(field, e.target.value)}
      onBlur={(e) => {
        const next = clampFilterSize(e.target.value);
        if (next !== e.target.value) editor.setNum(field, next);
      }}
      className={clsx(className, changed && 'ring-1 ring-ok')}
    />
  );
}

/**
 * Legacy's point table (`zone.php:373-405`, built by `drawZonePoints`): one
 * row per vertex with X and Y as numbers, `+` inserting the midpoint between
 * this vertex and the next (wrapping at the end) and `−` deleting it, shown
 * only while more than three remain. Legacy deals the rows across two tables
 * (`i % 2`); pass `columns={2}` for that.
 */
export function PointTable({ points, maxX, maxY, onChange, columns = 1, inputClassName, className }: {
  points: Point[];
  maxX: number;
  maxY: number;
  onChange: (points: Point[]) => void;
  columns?: 1 | 2;
  inputClassName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
  const setCoord = (i: number, axis: 'x' | 'y', raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next = points.slice();
    next[i] = { ...next[i], [axis]: clamp(n, axis === 'x' ? maxX : maxY) };
    onChange(next);
  };

  const indices = points.map((_, i) => i);
  const groups = columns === 2 ? [indices.filter((i) => i % 2 === 0), indices.filter((i) => i % 2 === 1)] : [indices];

  return (
    <div className={clsx('flex gap-4 items-start', className)}>
      {groups.map((group, g) => (
        <table key={g} className="flex-1 text-xs tabular-nums" aria-label={t('Points')}>
          <thead>
            <tr className="text-fg-dim">
              <th scope="col" className="text-start font-normal w-8">{t('Point')}</th>
              <th scope="col" className="text-start font-normal">{t('X')}</th>
              <th scope="col" className="text-start font-normal">{t('Y')}</th>
              <th scope="col" className="text-end font-normal w-12">{t('Action')}</th>
            </tr>
          </thead>
          <tbody>
            {group.map((i) => {
              const pt = points[i];
              return (
                <tr key={i}>
                  <td className="text-fg-dim">{i + 1}</td>
                  <td className="pe-1">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={maxX}
                      value={Math.round(pt.x * 100) / 100}
                      aria-label={t('Point {{n}} X', { n: i + 1 })}
                      onChange={(e) => setCoord(i, 'x', e.target.value)}
                      className={clsx('w-full', inputClassName)}
                    />
                  </td>
                  <td className="pe-1">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={maxY}
                      value={Math.round(pt.y * 100) / 100}
                      aria-label={t('Point {{n}} Y', { n: i + 1 })}
                      onChange={(e) => setCoord(i, 'y', e.target.value)}
                      className={clsx('w-full', inputClassName)}
                    />
                  </td>
                  <td className="text-end whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={t('Add a point after point {{n}}', { n: i + 1 })}
                      onClick={() => onChange(insertMidpoint(points, i))}
                      className="px-1.5 rounded hover:bg-black/10"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label={t('Remove point {{n}}', { n: i + 1 })}
                      disabled={points.length <= 3}
                      onClick={() => onChange(points.filter((_, j) => j !== i))}
                      className="px-1.5 rounded hover:bg-black/10 disabled:opacity-40"
                    >
                      −
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}
