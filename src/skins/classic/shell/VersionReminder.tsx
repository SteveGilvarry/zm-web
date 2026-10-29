import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { updateConfig } from '@/api/configs';
import { useToast } from '@/components/common/toastStore';
import { reminderWrite, type ReminderOption } from './versionState';

/**
 * `getZMVersionHTML` for a System editor while an update is available: the
 * version is a dropdown under an "update available" header offering to
 * ignore the release or be reminded later.
 */
export function ClassicVersionReminder({ version, lastVersion, className, title }: {
  version: string;
  lastVersion: string;
  className?: string;
  title: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const write = useMutation({
    mutationFn: (option: ReminderOption) => {
      const { name, value } = reminderWrite(option, lastVersion, Math.floor(Date.now() / 1000));
      return updateConfig(name, value);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configs'] }),
    onError: toast.apiError,
    onSettled: () => setOpen(false),
  });

  const items: Array<[ReminderOption, string]> = [
    ['ignore', t('Ignore this version')],
    ['hour', t('Remind again in 1 hour')],
    ['day', t('Remind again in 1 day')],
    ['week', t('Remind again in 1 week')],
    ['month', t('Remind again in 1 month')],
    ['never', t("Don't remind about new versions")],
  ];

  return (
    <div ref={ref} className={clsx('relative', className)} title={title} data-testid="stat-version">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="hover:underline"
      >
        v{version}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('An update to ZoneMinder is available.')}
          className="absolute end-0 top-full mt-1 z-30 min-w-56 bg-white border border-zinc-300 rounded-sm shadow-md py-1 text-sm text-zinc-800"
        >
          <div className="px-3 py-1 text-xs text-zinc-500">{t('An update to ZoneMinder is available.')}</div>
          {items.map(([option, label]) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              disabled={write.isPending}
              onClick={() => write.mutate(option)}
              className="block w-full text-start px-3 py-1 hover:bg-zinc-100 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
