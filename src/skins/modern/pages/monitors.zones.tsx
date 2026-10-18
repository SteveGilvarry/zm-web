import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Lock, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { Button } from '@/components/common/Button';
import { Checkbox } from '@/components/common/Checkbox';
import { QueryState } from '@/components/common/QueryState';
import type { PagePropsMap } from '@/skins/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { formatFps } from '@/features/monitors/useMonitorStatuses';
import { ZoneEditor } from '@/features/zones/ZoneEditor';
import { ZonesPicture } from '@/features/zones/ZonesPicture';
import { ZONE_TYPE_COLORS, zoneTypeLabel } from '@/features/zones/zoneTypes';
import { useZonesListPage } from '@/features/zones/useZonesListPage';
import { zoneArea, zoneOutOfBounds } from '@/features/zones/zoneArea';
import { zoneSettingRows } from '@/features/zones/zoneSettings';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/**
 * Zones — the modern skin.
 *
 * One line of chrome: the breadcrumb, the coverage reading and the verbs.
 * Under it, the camera with every zone drawn on it beside the zone table;
 * opening a zone (`?zid=`) swaps both for the polygon editor and the zone's
 * stored settings (docs/DESIGN.md).
 */
export default function MonitorZonesPage({ monitorId }: PagePropsMap['monitors.zones']) {
  const { t } = useTranslation();
  const page = useZonesListPage(monitorId);
  const { can } = usePerms();
  const canEdit = can('monitors', 'Edit');
  const { monitor, isLoading, view, hasDimensions, zones, marked, runtime } = page;
  useDocumentTitle(t('Zones'));

  // The zone whose settings the panel below the editor describes.
  const selectedZone = zones.find((z) => z.id === page.editing) ?? null;
  const editing = page.editing != null;

  return (
    <AppShell title={t('Zones')}>
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        <div className="flex items-center gap-3 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface text-sm">
          <nav aria-label={t('Breadcrumb')} className="flex items-center gap-2 min-w-0">
            <Link
              to="/monitors/$monitorId"
              params={{ monitorId: String(monitorId) }}
              className="inline-flex items-center gap-1 text-fg-dim hover:text-fg transition-colors truncate"
            >
              <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
              {monitor?.name ?? t('Monitor {{id}}', { id: monitorId })}
            </Link>
            <span className="text-fg-faint" aria-hidden>/</span>
            {editing ? (
              <button type="button" onClick={page.closeEditor} className="text-fg-dim hover:text-fg">
                {t('Zones')}
              </button>
            ) : (
              <span className="text-fg" aria-current="page">{t('Zones')}</span>
            )}
            {editing && (
              <>
                <span className="text-fg-faint" aria-hidden>/</span>
                <span className="text-fg truncate" aria-current="page">
                  {page.editing === 'new' ? t('New zone') : selectedZone?.name ?? ''}
                </span>
              </>
            )}
          </nav>

          <span className="ms-auto text-xs font-mono tabular-nums text-fg-dim whitespace-nowrap" data-testid="zones-coverage">
            {t('{{count}} zone', { count: zones.length })}
            {zones.length > 0 && view && (
              <>
                {' · '}
                {t('{{pct}}% covered', {
                  // Measured from each polygon. ZoneMinder's stored
                  // Zones.Area goes stale as soon as anything but its own
                  // editor writes Coords (zm-api#43).
                  pct: Math.min(100, zones.reduce((sum, z) => sum + zoneArea(z, view).pct, 0)).toFixed(0),
                })}
              </>
            )}
          </span>
          {!editing && canEdit && (
            <>
              {marked.size > 0 && (
                <Button size="sm" variant="danger" onClick={page.deleteMarked} disabled={page.busy}>
                  <Trash2 size={12} aria-hidden />
                  {t('Delete marked ({{count}})', { count: marked.size })}
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={() => page.openEditor('new')} disabled={!hasDimensions}>
                <Plus size={12} aria-hidden />
                {t('Add zone')}
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <QueryState
            isLoading={isLoading}
            isError={page.zonesError}
            error={page.error}
            onRetry={page.refetch}
            empty={!!monitor && !hasDimensions}
            emptyMessage={t('Monitor dimensions unavailable — zones require a captured frame.')}
          >
            {monitor && view && !editing && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-3 items-start">
                <div className="min-w-0">
                  <ZonesPicture
                    monitor={monitor}
                    frame={view}
                    zones={zones}
                    onZoneClick={page.openEditor}
                    canEditMonitor={canEdit}
                  />
                  <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-fg-dim" data-testid="zones-stream-status">
                    <span className="text-fg">{monitor.name}</span>
                    <span className="font-mono tabular-nums">{t('id {{id}}', { id: monitor.id })}</span>
                    {runtime && (
                      <>
                        <span>{runtime.status}</span>
                        <span className="font-mono tabular-nums" title={t('Capturing FPS')}>
                          {formatFps(runtime.captureFps)}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded border border-border-subtle bg-surface overflow-hidden">
                  {zones.length === 0 ? (
                    <p className="p-4 text-center text-sm text-fg-dim">
                      {canEdit ? t('No zones yet. Add one to start detecting motion.') : t('No zones yet.')}
                    </p>
                  ) : (
                    <table className="w-full text-sm" aria-label={t('Zones')}>
                      <thead className="text-xs text-fg-dim border-b border-border-subtle">
                        <tr>
                          <th scope="col" className="text-start font-normal px-3 py-1.5">{t('Name')}</th>
                          <th scope="col" className="text-start font-normal px-2 py-1.5">{t('Type')}</th>
                          <th scope="col" className="text-end font-normal px-2 py-1.5">{t('Area')}</th>
                          {canEdit && (
                            <th scope="col" className="px-3 py-1.5 w-8">
                              <span className="sr-only">{t('Mark')}</span>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {zones.map((z) => {
                          const area = zoneArea(z, view);
                          const oob = zoneOutOfBounds(z, view);
                          const c = ZONE_TYPE_COLORS[z.type] ?? ZONE_TYPE_COLORS.Active;
                          return (
                            <tr key={z.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-2">
                              <td className="px-3 py-1.5">
                                <span className="inline-flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c.stroke }} aria-hidden />
                                  <button type="button" onClick={() => page.openEditor(z.id)} className="text-fg hover:text-accent text-start">
                                    {z.name}
                                  </button>
                                  {oob && (
                                    <span
                                      className="text-warn"
                                      title={t('Zone coordinates extend beyond image dimensions ({{w}}x{{h}}). Points have been clamped.', { w: view.width, h: view.height })}
                                    >
                                      <AlertTriangle size={13} aria-label={t('Zone extends outside the frame')} />
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-fg-dim">{zoneTypeLabel(z.type, t)}</td>
                              <td className="px-2 py-1.5 text-end font-mono tabular-nums text-xs">
                                {area.px.toLocaleString()}
                                <span className="text-fg-dim">{' · '}{t('{{pct}}%', { pct: area.pct.toFixed(1) })}</span>
                              </td>
                              {canEdit && (
                                <td className="px-3 py-1.5">
                                  <Checkbox
                                    checked={marked.has(z.id)}
                                    onChange={() => page.toggleMark(z.id)}
                                    aria-label={t('Mark {{name}}', { name: z.name })}
                                  />
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {monitor && view && editing && (
              <>
                <RequirePerm feature="monitors" level="Edit" fallback="message">
                  <div dir="ltr">
                    <ZoneEditor
                      monitorId={monitor.id}
                      width={view.width}
                      height={view.height}
                      openZoneId={page.editing}
                      onSelectionChange={(id) => (id == null ? page.closeEditor() : page.openEditor(id))}
                      defaultPlayer={monitor.default_player}
                      orientation={monitor.orientation}
                    />
                  </div>
                </RequirePerm>

                {selectedZone && (
                  <Panel
                    title={t('Stored settings')}
                    icon={<Lock size={16} />}
                    action={<span className="text-xs text-fg-dim">{selectedZone.name}</span>}
                  >
                    <p className="text-xs text-fg-dim mb-3">
                      {t('The zone as the backend has it — the form beside the canvas is what changes it.')}
                    </p>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8" data-testid="zone-stored-settings">
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
