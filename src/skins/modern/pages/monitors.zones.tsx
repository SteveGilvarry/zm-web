import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Square } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import type { PagePropsMap } from '@/skins/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { ZoneEditor } from '@/features/zones/ZoneEditor';
import { useZonesListPage } from '@/features/zones/useZonesListPage';
import { zoneArea } from '@/features/zones/zoneArea';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Zones — Mission Control: breadcrumb + the polygon editor in a panel. */
export default function MonitorZonesPage({ monitorId }: PagePropsMap['monitors.zones']) {
  const { t } = useTranslation();
  const page = useZonesListPage(monitorId);
  const { monitor, isLoading, view, hasDimensions, zones } = page;
  useDocumentTitle(t('Zones'));

  return (
    <AppShell title={t('Zones')}>
      <div className="p-4 sm:p-6 space-y-4">
        <nav aria-label={t('Breadcrumb')} className="flex items-center gap-3 text-sm">
          <Link
            to="/monitors/$monitorId"
            params={{ monitorId: String(monitorId) }}
            className="inline-flex items-center gap-1 text-text-muted hover:text-cyan transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            {monitor?.name ?? t('Monitor {{id}}', { id: monitorId })}
          </Link>
          <span className="text-text-dim" aria-hidden>/</span>
          <span className="text-text-primary" aria-current="page">{t('Zones')}</span>
        </nav>

        <QueryState
          isLoading={isLoading}
          isError={page.zonesError}
          error={page.error}
          onRetry={page.refetch}
          empty={!!monitor && !hasDimensions}
          emptyMessage={t('Monitor dimensions unavailable — zones require a captured frame.')}
        >
          {monitor && view && (
            <Panel
              title={t('Motion zones')}
              icon={<Square size={16} />}
              action={
                <span className="text-xs font-mono text-text-muted">
                  {t('{{count}} zone', { count: zones.length })}
                  {zones.length > 0 && (
                    <>
                      {' · '}
                      {t('{{pct}}% covered', {
                        pct: Math.min(100, zones.reduce((sum, z) => sum + zoneArea(z, view).pct, 0)).toFixed(0),
                      })}
                    </>
                  )}
                </span>
              }
            >
              <RequirePerm feature="monitors" level="Edit" fallback="message">
                <div dir="ltr">
                  <ZoneEditor monitorId={monitor.id} width={view.width} height={view.height} />
                </div>
              </RequirePerm>
            </Panel>
          )}
        </QueryState>
      </div>
    </AppShell>
  );
}
