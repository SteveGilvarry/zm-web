import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

export interface ChosenOption {
  value: number;
  label: string;
}

interface ChosenMultiSelectProps {
  id?: string;
  /** Accessible name for the search box. */
  label: string;
  options: ChosenOption[];
  value: number[];
  onChange: (next: number[]) => void;
}

/**
 * The jQuery "chosen" multi-select legacy puts on `.chosen` selects
 * (`groups.js:7`, `$j('#newGroupMonitorIds').chosen()`): the picks as
 * removable chips, a type-to-filter box after them, and the remaining
 * options in a list under it. Backspace in the empty box drops the last
 * pick, as chosen's does.
 */
export function ChosenMultiSelect({ id, label, options, value, onChange }: ChosenMultiSelectProps) {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const picked = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is ChosenOption => !!o);
  const q = query.trim().toLowerCase();
  const remaining = options.filter((o) => !value.includes(o.value) && (!q || o.label.toLowerCase().includes(q)));
  const activeIndex = Math.min(active, Math.max(0, remaining.length - 1));

  const add = (v: number) => {
    onChange([...value, v]);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  };
  const remove = (v: number) => onChange(value.filter((x) => x !== v));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, remaining.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && remaining[activeIndex]) {
        e.preventDefault();
        add(remaining[activeIndex].value);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === 'Backspace' && query === '' && picked.length > 0) {
      remove(picked[picked.length - 1].value);
    }
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1 min-h-8 rounded-sm border border-zinc-400 bg-white px-1 py-0.5 cursor-text focus-within:border-[#337ab7] focus-within:ring-1 focus-within:ring-[#337ab7]"
        onClick={() => inputRef.current?.focus()}
      >
        {picked.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded-sm border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-sm text-zinc-800"
          >
            {o.label}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(o.value); }}
              aria-label={t('Remove {{name}}', { name: o.label })}
              className="text-zinc-500 hover:text-zinc-900"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && remaining[activeIndex] ? `${listId}-${remaining[activeIndex].value}` : undefined}
          value={query}
          placeholder={picked.length === 0 ? t('Select Some Options') : undefined}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-24 border-0 bg-transparent px-1 py-0.5 text-sm text-zinc-900 outline-none"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          className="absolute z-10 mt-0.5 w-full max-h-48 overflow-auto rounded-sm border border-zinc-400 bg-white text-sm shadow"
        >
          {remaining.length === 0 ? (
            <li className="px-2 py-1 text-zinc-500">
              {q ? t('No results match "{{query}}"', { query }) : t('No more options')}
            </li>
          ) : remaining.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${o.value}`}
              role="option"
              aria-selected={false}
              // mousedown, not click: the box's blur would close the list first.
              onMouseDown={(e) => { e.preventDefault(); add(o.value); }}
              onMouseEnter={() => setActive(i)}
              className={clsx('px-2 py-1 cursor-pointer', i === activeIndex ? 'bg-[#337ab7] text-white' : 'text-zinc-900')}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
