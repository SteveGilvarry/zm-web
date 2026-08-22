import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { ClassicIconButton } from './Button';

interface ClassicDropdownProps {
  /** Accessible name of the trigger. */
  label: string;
  icon: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

/**
 * bootstrap-table toolbar dropdown (Columns ▦, Export ⇩): a square blue
 * trigger and a white menu. Closes on outside click and Escape; the trigger
 * carries `aria-expanded` / `aria-controls`.
 */
export function ClassicDropdown({ label, icon, children, align = 'end', className }: ClassicDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <ClassicIconButton
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="w-auto px-2 gap-1"
      >
        {icon}
        <ChevronDown size={12} aria-hidden />
      </ClassicIconButton>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={clsx(
            'absolute top-full mt-1 z-30 min-w-44 bg-white border border-zinc-300 rounded-sm shadow-md py-1 text-sm',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const classicMenuItemClass =
  'block w-full text-start px-3 py-1.5 text-zinc-800 hover:bg-zinc-100 disabled:text-zinc-400';
