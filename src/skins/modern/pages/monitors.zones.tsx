import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Square } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import type { PagePropsMap } from '@/skins/types';
import { ZoneEditor } from '@/features/zones/ZoneEditor';
import { useZonesPage } from '@/features/zones/useZonesPage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Zones — Mission Control: breadcrumb + the polygon editor in a panel. */
export default function MonitorZonesPage({ monitorId }: PagePropsMap['monitors.zones']) {
  const { t } = useTranslation();
  const { monitor, isLoading, view, hasDimensions } = useZonesPage(monitorId);
  useDocumentTitle(t('Zones'));

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link
            to="/monitors/$monitorId"
            params={{ monitorId: String(monitorId) }}
            className="inline-flex items-center gap-1 text-text-muted hover:text-cyan transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" />
            {monitor?.name ?? t('Monitor {{id}}', { id: monitorId })}
          </Link>
          <span className="text-text-dim">/</span>
          <span className="text-text-primary">{t('Zones')}</span>
        </div>

        {monitor && view && hasDimensions ? (
          <Panel title={t('Motion zones')} icon={<Square size={16} />}>
            <div dir="ltr">
              <ZoneEditor
                monitorId={monitor.id}
                width={view.width}
                height={view.height}
              />
            </div>
          </Panel>
        ) : isLoading ? (
          <div className="p-8 text-center text-text-muted">{t('Loading monitor…')}</div>
        ) : (
          <div className="p-8 text-center text-text-muted">
            {t('Monitor dimensions unavailable — zones require a captured frame.')}
          </div>
        )}
      </div>
    </AppShell>
  );
}
