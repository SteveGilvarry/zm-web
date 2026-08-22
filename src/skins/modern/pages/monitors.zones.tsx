import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Lock, Square } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import type { PagePropsMap } from '@/skins/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { ZoneEditor } from '@/features/zones/ZoneEditor';
import { useZonesListPage } from '@/features/zones/useZonesListPage';
import { zoneArea } from '@/features/zones/zoneArea';
import { zoneSettingRows } from '@/features/zones/zoneSettings';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/**
 * Zones — the modern skin.
 *
 * A breadcrumb line at the top, then the polygon editor filling the frame
 * and scrolling inside it. The editor is the page; the read-only motion
 * settings follow it (docs/DESIGN.md).
 */
export default function MonitorZonesPage({ monitorId }: PagePropsMap['monitors.zones']) {
  const { t } = useTranslation();
  const page = useZonesListPage(monitorId);
  const { monitor, isLoading, view, hasDimensions, zones } = page;
  useDocumentTitle(t('Zones'));

  // The zone whose settings the panel below the editor describes.
  const selectedZone = zones.find((z) => z.id === page.editing) ?? null;

  return (
    <AppShell title={t('Zones')}>
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        <nav
          aria-label={t('Breadcrumb')}
          className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface text-sm"
        >
          <Link
            to="/monitors/$monitorId"
            params={{ monitorId: String(monitorId) }}
            className="inline-flex items-center gap-1 text-fg-dim hover:text-fg transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            {monitor?.name ?? t('Monitor {{id}}', { id: monitorId })}
          </Link>
          <span className="text-fg-faint" aria-hidden>/</span>
          <span className="text-fg" aria-current="page">{t('Zones')}</span>
        </nav>

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <QueryState
            isLoading={isLoading}
            isError={page.zonesError}
            error={page.error}
            onRetry={page.refetch}
            empty={!!monitor && !hasDimensions}
            emptyMessage={t('Monitor dimensions unavailable — zones require a captured frame.')}
          >
            {monitor && view && (
              <>
                <Panel
                  title={t('Motion zones')}
                  icon={<Square size={16} />}
                  action={
                    <span className="text-xs font-mono tabular-nums text-fg-dim">
                      {t('{{count}} zone', { count: zones.length })}
                      {zones.length > 0 && (
                        <>
                          {' · '}
                          {t('{{pct}}% covered', {
                            // Measured from each polygon. ZoneMinder's stored
                            // Zones.Area goes stale as soon as anything but its
                            // own editor writes Coords (zm-api#43).
                            pct: Math.min(
                              100,
                              zones.reduce((sum, z) => sum + zoneArea(z, view).pct, 0),
                            ).toFixed(0),
                          })}
                        </>
                      )}
                    </span>
                  }
                >
                  <RequirePerm feature="monitors" level="Edit" fallback="message">
                    <div dir="ltr">
                      <ZoneEditor
                        monitorId={monitor.id}
                        width={view.width}
                        height={view.height}
                        openZoneId={page.editing}
                        onSelectionChange={(id) => (id == null ? page.closeEditor() : page.openEditor(id))}
                      />
                    </div>
                  </RequirePerm>
                </Panel>

                {selectedZone && (
                  <Panel
                    title={t('Motion settings')}
                    icon={<Lock size={16} />}
                    action={<span className="text-xs text-fg-dim">{selectedZone.name}</span>}
                  >
                    <p className="text-xs text-fg-dim mb-3">
                      {t('Motion settings are read-only: the API accepts only the zone name and polygon.')}
                    </p>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                      {zoneSettingRows(selectedZone, t).map((row) => (
                        <div
                          key={row.key}
                          className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border-subtle"
                        >
                          <dt className="text-xs text-fg-dim">{row.label}</dt>
                          <dd className="flex items-center gap-2 text-xs font-mono tabular-nums text-fg text-end">
                            {row.swatch && (
                              <span
                                data-testid="zone-alarm-swatch"
                                className="inline-block w-3 h-3 rounded-sm border border-border-subtle"
                                style={{ backgroundColor: row.swatch }}
                                aria-hidden
                              />
                            )}
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Panel>
                )}
              </>
            )}
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}
