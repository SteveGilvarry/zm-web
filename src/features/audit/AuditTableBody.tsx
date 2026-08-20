import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { AuditPageState } from './useAuditPage';
import type { AuditRow } from './auditRows';

/**
 * The cells of one audit row, shared by both skins (they only differ in the
 * table chrome around them). Deep links follow legacy: Id / Name → Montage
 * Review over the window, Events → the events list filtered to it,
 * First / Last → the event.
 */
export function useAuditCells(s: AuditPageState) {
  const { t } = useTranslation();
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };
  return (row: AuditRow, linkClass: string) => {
    const { monitor, stats } = row;
    const review = s.reviewSearch(monitor.id);
    const eventRef = (ref: { id: number; at: string } | null) =>
      ref ? (
        <Link to="/events/$eventId" params={{ eventId: String(ref.id) }} className={linkClass}>
          {t('{{id}} at {{time}}', { id: ref.id, time: fmt(ref.at) })}
        </Link>
      ) : t('none');
    return {
      id: <Link to="/montagereview" search={review} className={linkClass}>{monitor.id}</Link>,
      name: <Link to="/montagereview" search={review} className={linkClass}>{monitor.name}</Link>,
      server: s.serverName(monitor.server_id),
      events: row.loading
        ? <span className="opacity-60">…</span>
        : row.error
          ? <span role="alert" title={row.error.message}>{t('error')}</span>
          : <Link to="/events" search={s.eventsSearch(monitor.id)} className={linkClass}>{stats.events}</Link>,
      first: row.loading ? '' : eventRef(stats.first),
      last: row.loading ? '' : eventRef(stats.last),
      minGap: stats.minGap ?? 0,
      maxGap: stats.maxGap ?? 0,
      placeholder: <span title={t('Per-event file checks need zm-api#36.')}>{t('needs zm-api#36')}</span>,
    };
  };
}
