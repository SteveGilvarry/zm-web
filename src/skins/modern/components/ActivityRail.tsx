import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

/**
 * Recent activity beside the wall.
 *
 * The console used to spend a third of its width on two bordered panels —
 * "System" and "Recent Events" — leaving the cameras in a box. System moved
 * into the status line's disclosure; what remains beside the wall is the one
 * thing an operator watches change: events as they land. It collapses, and
 * the wall takes the space.
 */
export function ActivityRail({
  title,
  total,
  children,
  footerHref,
  footerLabel,
}: {
  title: string;
  total?: string;
  children: ReactNode;
  footerHref?: string;
  footerLabel?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <aside
      aria-label={title}
      className={clsx(
        'shrink-0 border-s border-border-subtle bg-surface flex flex-col transition-[width] duration-200',
        open ? 'w-72' : 'w-10',
      )}
    >
      <div className="flex items-center gap-2 h-9 px-2 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? t('Collapse {{title}}', { title }) : t('Expand {{title}}', { title })}
          className="p-1 rounded text-fg-dim hover:text-fg transition-colors"
        >
          {open
            ? <PanelRightClose size={14} className="rtl:-scale-x-100" aria-hidden />
            : <PanelRightOpen size={14} className="rtl:-scale-x-100" aria-hidden />}
        </button>
        {open && (
          <>
            <span className="text-sm text-fg">{title}</span>
            {total && (
              <span className="ms-auto text-xs font-mono tabular-nums text-fg-dim">{total}</span>
            )}
          </>
        )}
      </div>

      {open && (
        <>
          <div className="flex-1 overflow-auto p-2">{children}</div>
          {footerHref && footerLabel && (
            <Link
              to={footerHref}
              className="border-t border-border-subtle px-3 py-2 text-xs text-accent hover:bg-surface-2 transition-colors"
            >
              {footerLabel}
            </Link>
          )}
        </>
      )}
    </aside>
  );
}
