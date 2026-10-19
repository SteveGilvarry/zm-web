import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import type { StorageArea, StorageTone } from '@/features/storage/useStorageAreas';
import { storageUsageTitle } from '@/features/storage/storageUsage';
import { STAT_TONE_CLASS } from './statTone';

/**
 * Legacy `getStorageHTML` (`skins/classic/includes/functions.php:895`):
 * one `Name: NN%` link per enabled area, each to Options → Storage and
 * titled "used of total, X used by events". Up to two areas sit inline;
 * with more, they collapse into a "Storage" dropdown coloured by the
 * fullest area.
 */
export function ClassicStorageStats({ areas, tone }: { areas: StorageArea[]; tone: StorageTone }) {
  const { t } = useTranslation();
  if (areas.length === 0) return null;
  if (areas.length <= 2) {
    return (
      <span className="inline-flex items-center gap-2" data-testid="stat-storage">
        {areas.map((area) => <AreaLink key={area.storage.id} area={area} />)}
      </span>
    );
  }
  return <StorageDropdown areas={areas} tone={tone} label={t('Storage')} />;
}

function AreaLink({ area, menuItem }: { area: StorageArea; menuItem?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/settings/storage"
      role={menuItem ? 'menuitem' : undefined}
      className={clsx(
        menuItem ? 'block px-3 py-1.5 hover:bg-white/10' : 'hover:underline',
        STAT_TONE_CLASS[area.tone],
      )}
      title={storageUsageTitle(area.usage, t)}
      data-testid="stat-storage-area"
    >
      {area.storage.name}: {area.usage.percent}%
    </Link>
  );
}

function StorageDropdown({ areas, tone, label }: { areas: StorageArea[]; tone: StorageTone; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
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

  return (
    <span ref={ref} className="relative" data-testid="stat-storage">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={clsx('hover:underline', STAT_TONE_CLASS[tone])}
      >
        {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <span
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute top-full start-0 mt-1 z-40 min-w-40 bg-[#485460] border border-black/40 rounded-sm shadow-md py-1 text-sm flex flex-col"
        >
          {areas.map((area) => <AreaLink key={area.storage.id} area={area} menuItem />)}
        </span>
      )}
    </span>
  );
}
