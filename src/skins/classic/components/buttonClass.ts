import { clsx } from 'clsx';

export type ClassicButtonTone = 'primary' | 'default' | 'danger' | 'link';
export type ClassicButtonSize = 'sm' | 'md';

/**
 * Class recipe for the legacy Bootstrap-flat button so `<Link>`s and
 * `<label>`s can look like buttons too. Square corners, uppercase label,
 * solid blue for the primary verb, grey for the rest, red for destructive.
 */
export function classicButtonClass(
  tone: ClassicButtonTone = 'default',
  size: ClassicButtonSize = 'md',
  className?: string,
): string {
  return clsx(
    'inline-flex items-center justify-center gap-1.5 rounded-sm border font-semibold uppercase tracking-wide',
    'transition-colors select-none whitespace-nowrap',
    'disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#337ab7]',
    size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
    tone === 'primary' && 'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090]',
    tone === 'default' && 'bg-[#8a9299] border-[#7b838a] text-white hover:bg-[#6f777e]',
    tone === 'danger' && 'bg-[#d9534f] border-[#d43f3a] text-white hover:bg-[#c9302c]',
    tone === 'link' && 'bg-transparent border-transparent text-[#337ab7] normal-case font-normal tracking-normal hover:underline px-1',
    className,
  );
}
