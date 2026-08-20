import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowRight } from 'lucide-react';

/**
 * Breadcrumb from the audit report to the archived-events list. The events
 * page reads `?archived=true` and sends it to the backend as a filter.
 */
export function ArchivedLink({ variant }: { variant: 'modern' | 'classic' }) {
  const { t } = useTranslation();
  const cls = variant === 'classic'
    ? 'inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:underline'
    : 'inline-flex items-center gap-1.5 text-sm text-cyan hover:text-cyan-dim transition-colors';
  return (
    <Link
      to="/events"
      search={{ archived: true }}
      className={cls}
      aria-label={t('Browse archived events')}
    >
      <Archive size={14} />
      {t('Browse archived events')}
      <ArrowRight size={14} className="rtl:-scale-x-100" />
    </Link>
  );
}
