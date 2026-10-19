import {
  useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent,
} from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

export interface ChosenOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ClassicChosenProps {
  id?: string;
  /** Accessible name of the picker; also names the clear button. */
  label: string;
  options: ChosenOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Shown in the empty box; legacy's `data-placeholder`, usually "All". */
  placeholder?: string;
  /** Width and the like; the box itself is `inline-block`. */
  className?: string;
  /** Legacy's `.btn-term-remove-all` (×) in the top-right corner. */
  clearButton?: boolean;
}

/**
 * Legacy's Chosen multi-select (`chosen.jquery.js`, `class="chosen"
 * multiple`): one bordered box holding a grey chip per picked option and a
 * search field, a drop-down of the remaining options under it, and ZM's
 * clear-all button over the top-right corner. The sizes and colours are
 * `chosen.css` with `skin.css`'s overrides (4 px radius, rgb(200,200,200)
 * border). Behaviour follows Chosen's multi mode: `search_contains`, the
 * drop closes after a pick, Backspace on an empty search removes the last
 * chip, Escape closes.
 */
export function ClassicChosen({
  id, label, options, value, onChange, placeholder, className, clearButton = true,
}: ClassicChosenProps) {
  const { t } = useTranslation();
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => new Set(value), [value]);
  const chips = useMemo(
    () => value.map((v) => ({ value: v, label: (options.find((o) => o.value === v)?.label ?? v).trim() })),
    [value, options],
  );
  // Chosen hides nothing: a picked option stays listed, greyed. The search
  // is a case-insensitive substring match (`search_contains: true`).
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.filter((o) => !q || o.label.toLowerCase().includes(q));
  }, [options, search]);
  const pickable = results.filter((o) => !o.disabled && !selected.has(o.value));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Any (re)open or a new search starts the highlight at the first match.
  const show = () => { setOpen(true); setHighlight(0); };

  const pick = (v: string) => {
    onChange([...value, v]);
    setSearch('');
    setOpen(false);
  };
  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) show();
        else setHighlight((h) => Math.min(h + 1, Math.max(pickable.length - 1, 0)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        break;
      case 'Enter':
        if (open && pickable[highlight]) {
          e.preventDefault();
          pick(pickable[highlight].value);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
          setSearch('');
        }
        break;
      case 'Backspace':
        if (search === '' && value.length > 0) {
          e.preventDefault();
          remove(value[value.length - 1]);
        }
        break;
      default:
        break;
    }
  };

  const highlighted = pickable[highlight];
  const optionId = (v: string) => `${autoId}-opt-${v.replace(/[^\w-]/g, '_')}`;

  return (
    <span ref={rootRef} className={clsx('relative inline-block text-start align-top', className)}>
      {/* The box: `.chosen-container-multi .chosen-choices`. */}
      <span
        onMouseDown={(e) => {
          // Keep focus in the search field, as Chosen does, unless a chip's
          // × or the clear-all button was the target.
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          inputRef.current?.focus();
          show();
        }}
        className={clsx(
          'flex min-h-[29px] w-full cursor-text flex-wrap items-center rounded-[4px] border border-[#c8c8c8] bg-white px-[5px]',
          'bg-[linear-gradient(#eee_1%,#fff_15%)]',
          open && 'shadow-[0_0_5px_rgba(0,0,0,0.3)]',
          clearButton && 'pe-6',
        )}
      >
        {chips.map((c) => (
          <span
            key={c.value}
            className="relative my-[3px] me-[5px] inline-flex max-w-full items-center rounded-[3px] border border-[#aaa] bg-[#eee] bg-[linear-gradient(#f4f4f4_20%,#f0f0f0_50%,#e8e8e8_52%,#eee_100%)] ps-[5px] pe-5 py-[3px] text-[13px] leading-[13px] text-[#333]"
          >
            <span className="truncate">{c.label}</span>
            <button
              type="button"
              onClick={() => remove(c.value)}
              aria-label={t('Remove {{label}}', { label: c.label })}
              className="absolute end-[3px] top-[3px] inline-flex h-3 w-3 items-center justify-center text-[#666] hover:text-[#111]"
            >
              <X size={10} strokeWidth={3} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlighted ? optionId(highlighted.value) : undefined}
          autoComplete="off"
          value={search}
          placeholder={chips.length === 0 ? placeholder : undefined}
          onChange={(e) => { setSearch(e.target.value); show(); }}
          onFocus={show}
          onKeyDown={onKeyDown}
          // `chosen-search` is an unlayered rule in index.css: the active box carries
          // the focus look, as Chosen's does, not the field inside it.
          className="chosen-search my-px h-[25px] min-w-[25px] flex-1 border-0 bg-transparent p-0 text-sm text-zinc-900 placeholder:text-[#999]"
          style={{ width: chips.length === 0 ? undefined : `${Math.max(search.length, 1)}ch` }}
        />
      </span>
      {clearButton && (
        <span className="absolute end-0 top-[2px] z-[1011]">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={value.length === 0}
            aria-label={t('Clear {{label}}', { label: label.toLocaleLowerCase() })}
            title={t('Clear {{label}}', { label: label.toLocaleLowerCase() })}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-[3px] border border-[#ccc] bg-white/90 text-[#666] hover:border-[#999] hover:bg-[#f0f0f0] hover:text-[#333] disabled:text-[#ccc] disabled:hover:border-[#ccc] disabled:hover:bg-white/90"
          >
            <X size={16} aria-hidden />
          </button>
        </span>
      )}
      {/* The drop: `.chosen-drop` + `.chosen-results`. */}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          className="absolute start-0 top-full z-[1010] m-0 max-h-60 w-full list-none overflow-y-auto rounded-b-[4px] border border-t-0 border-[#aaa] bg-white py-1 ps-0 pe-0 text-sm text-[#444] shadow-[0_4px_5px_rgba(0,0,0,0.15)]"
        >
          {results.length === 0 && (
            <li className="bg-[#f4f4f4] px-1.5 py-[5px] leading-[15px] text-[#777]">
              {t('No results match "{{search}}"', { search })}
            </li>
          )}
          {results.map((o) => {
            const isSelected = selected.has(o.value);
            const isHighlighted = highlighted?.value === o.value;
            return (
              <li
                key={o.value}
                id={optionId(o.value)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                data-value={o.value}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  const i = pickable.findIndex((p) => p.value === o.value);
                  if (i >= 0) setHighlight(i);
                }}
                onClick={() => {
                  if (o.disabled) return;
                  if (isSelected) remove(o.value);
                  else pick(o.value);
                }}
                className={clsx(
                  'whitespace-pre px-1.5 py-[5px] leading-[15px]',
                  isHighlighted && 'bg-[#3875d7] bg-[linear-gradient(#3875d7_20%,#2a62bc_90%)] text-white',
                  isSelected && !isHighlighted && 'text-[#ccc]',
                  o.disabled ? 'cursor-default text-[#ccc]' : 'cursor-pointer',
                )}
              >
                {o.label}
              </li>
            );
          })}
        </ul>
      )}
    </span>
  );
}
