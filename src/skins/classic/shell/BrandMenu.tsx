import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useZmConfigTable } from '@/features/config/useZmConfig';

const BRAND_LINKS = [
  { href: 'https://zoneminder.com/', label: 'ZoneMinder' },
  { href: 'https://zoneminder.readthedocs.io/en/stable/', label: 'Documentation' },
  { href: 'https://forums.zoneminder.com/', label: 'Support' },
] as const;

/**
 * The navbar brand, `getNavBrandHTML` (functions.php:1095): with
 * `ZM_HOME_ABOUT` it is a dropdown of the project's site, documentation and
 * forums; without it, a plain link to `ZM_HOME_URL` labelled `ZM_HOME_CONTENT`.
 */
export function ClassicBrandMenu() {
  const { t } = useTranslation();
  const { data: configs } = useZmConfigTable();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const brandClass = 'text-2xl font-semibold tracking-tight text-classic-nav-brand';
  const about = configs?.ZM_HOME_ABOUT === '1';
  const content = configs?.ZM_HOME_CONTENT || 'ZoneMinder';

  if (!about) {
    const url = configs?.ZM_HOME_URL || 'https://zoneminder.com/';
    return (
      <a href={url} target="_blank" rel="noreferrer" className={brandClass}>
        {content}
      </a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={brandClass}
      >
        {content}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('About ZoneMinder')}
          className="absolute top-full start-0 mt-1 z-40 min-w-44 bg-[#485460] border border-black/40 rounded-sm shadow-md py-1 text-sm"
        >
          {BRAND_LINKS.map((link) => (
            <a
              key={link.href}
              role="menuitem"
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-1.5 text-classic-nav-link hover:bg-white/10 hover:text-classic-nav-fg"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
