import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';

/** White page body under the classic nav; no panels, no glow. */
export function ClassicPage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main className={clsx('flex-1 min-w-0 px-3 py-3 bg-white text-zinc-900', className)}>
      {children}
    </main>
  );
}

interface ClassicHeaderProps {
  /** Centre title (`Monitor - 1 - Name`, `Zones`). */
  title?: ReactNode;
  /** Route for the blue back arrow; omitted → `history.back()`. */
  backTo?: string;
  onRefresh?: () => void;
  /** Controls at the inline end. */
  end?: ReactNode;
  children?: ReactNode;
}

/** Legacy `#header`: back + refresh squares, centred title, end cluster. */
export function ClassicHeader({ title, backTo, onRefresh, end, children }: ClassicHeaderProps) {
  const { t } = useTranslation();
  const square = 'inline-flex items-center justify-center w-9 h-8 rounded-sm border text-white transition-colors';
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="flex items-center gap-1">
        {backTo ? (
          <Link to={backTo} aria-label={t('Back')} title={t('Back')} className={clsx(square, 'bg-[#8a9299] border-[#7b838a] hover:bg-[#6f777e]')}>
            <ArrowLeft size={16} className="rtl:-scale-x-100" aria-hidden />
          </Link>
        ) : (
          <button type="button" onClick={() => window.history.back()} aria-label={t('Back')} title={t('Back')} className={clsx(square, 'bg-[#8a9299] border-[#7b838a] hover:bg-[#6f777e]')}>
            <ArrowLeft size={16} className="rtl:-scale-x-100" aria-hidden />
          </button>
        )}
        {onRefresh && (
          <button type="button" onClick={onRefresh} aria-label={t('Refresh')} title={t('Refresh')} className={clsx(square, 'bg-[#337ab7] border-[#2e6da4] hover:bg-[#286090]')}>
            <RefreshCw size={16} aria-hidden />
          </button>
        )}
      </div>
      {title && <h1 className="flex-1 text-center text-base font-bold text-zinc-900 min-w-0 truncate">{title}</h1>}
      {children}
      {end && <div className="flex items-center gap-1 ms-auto">{end}</div>}
    </div>
  );
}
