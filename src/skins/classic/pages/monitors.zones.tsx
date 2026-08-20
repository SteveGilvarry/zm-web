import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import type { PagePropsMap } from '@/skins/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { ZoneEditor } from '@/features/zones/ZoneEditor';
import { useZonesListPage } from '@/features/zones/useZonesListPage';
import { zoneArea, zoneColour, zoneOutOfBounds, zonePixelPoints } from '@/features/zones/zoneArea';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  ClassicButton, ClassicHeader, ClassicPage, ClassicTable, ClassicTd, ClassicTh, ClassicThead,
} from '@/skins/classic/components';

/**
 * Zones — classic skin: legacy `?view=zones&mid=`. The camera picture with
 * every zone's polygon on the left, the Name / Type / Area / Mark table on
 * the right with ADD NEW ZONE and DELETE under it. Clicking a zone (or Add)
 * swaps the picture for the polygon editor.
 */
export default function ClassicMonitorZonesPage({ monitorId }: PagePropsMap['monitors.zones']) {
  const { t } = useTranslation();
  const page = useZonesListPage(monitorId);
  const { monitor, view, zones, marked } = page;
  useDocumentTitle(t('Zones'));

  const frame = view ?? { width: 0, height: 0 };
  const typeLabel = (type: string): string => {
    switch (type) {
      case 'Active': return t('Active');
      case 'Inclusive': return t('Inclusive');
      case 'Exclusive': return t('Exclusive');
      case 'Preclusive': return t('Preclusive');
      case 'Inactive': return t('Inactive');
      case 'Privacy': return t('Privacy');
      default: return type;
    }
  };

  return (
    <AppShell title={t('Zones')}>
      <ClassicPage>
        <ClassicHeader backTo={`/monitors/${monitorId}`} onRefresh={page.refetch} />
        <QueryState
          isLoading={page.isLoading}
          isError={page.zonesError}
          error={page.error}
          onRetry={page.refetch}
          empty={!monitor}
          emptyMessage={t('Monitor not found')}
        >
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* Picture (or the editor) */}
            <div className="flex-1 min-w-0 w-full" dir="ltr">
              {page.editing != null && monitor && view && page.hasDimensions ? (
                <div className="bg-white border border-zinc-300 rounded-sm p-2">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-zinc-800">
                      {page.editing === 'new' ? t('New zone') : t('Edit zone')}
                    </h2>
                    <ClassicButton size="sm" icon={<X size={12} />} onClick={page.closeEditor}>{t('Done')}</ClassicButton>
                  </div>
                  <ZoneEditor monitorId={monitor.id} width={view.width} height={view.height} />
                </div>
              ) : (
                <div
                  className="relative bg-black w-full"
                  style={{ aspectRatio: frame.width > 0 && frame.height > 0 ? `${frame.width} / ${frame.height}` : '16 / 9' }}
                  data-testid="zones-picture"
                >
                  {monitor && (
                    // The box already has the post-rotation aspect, so the
                    // snapshot fills it (rotated cameras included).
                    <MonitorPreview
                      monitorId={monitor.id}
                      monitorName={monitor.name}
                      orientation={monitor.orientation}
                      isActive={monitor.capturing !== 'None'}
                      rotationFit="fill"
                    />
                  )}
                  {frame.width > 0 && (
                    <svg
                      viewBox={`0 0 ${frame.width} ${frame.height}`}
                      className="absolute inset-0 w-full h-full"
                      aria-label={t('Zone outlines')}
                      role="img"
                    >
                      {zones.map((z) => {
                        const pts = zonePixelPoints(z, frame);
                        const colour = zoneColour(z.type);
                        return (
                          <polygon
                            key={z.id}
                            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill={colour}
                            fillOpacity={0.25}
                            stroke={colour}
                            strokeWidth={Math.max(2, frame.width / 400)}
                          >
                            <title>{z.name}</title>
                          </polygon>
                        );
                      })}
                    </svg>
                  )}
                </div>
              )}
              {monitor && (
                <p className="text-sm text-zinc-700 mt-1">{t('{{name}} (id={{id}})', { name: monitor.name, id: monitor.id })}</p>
              )}
            </div>

            {/* Table */}
            <div className="w-full lg:w-[36rem] shrink-0">
              <h1 className="text-base font-bold text-zinc-900 text-center mb-2">{t('Zones')}</h1>
              <ClassicTable aria-label={t('Zones')}>
                <ClassicThead>
                  <tr>
                    <ClassicTh>{t('Name')}</ClassicTh>
                    <ClassicTh>{t('Type')}</ClassicTh>
                    <ClassicTh>{t('Area (px/%)')}</ClassicTh>
                    <ClassicTh className="text-center">
                      <span className="inline-flex items-center gap-1">
                        {t('Mark')}
                        <input
                          type="checkbox"
                          checked={zones.length > 0 && marked.size === zones.length}
                          onChange={page.toggleMarkAll}
                          aria-label={t('Mark all zones')}
                        />
                      </span>
                    </ClassicTh>
                  </tr>
                </ClassicThead>
                <tbody>
                  {zones.length === 0 && !page.zonesLoading && (
                    <tr><ClassicTd colSpan={4} className="text-center text-zinc-500">{t('No zones defined')}</ClassicTd></tr>
                  )}
                  {zones.map((z) => {
                    const area = zoneArea(z, frame);
                    const oob = frame.width > 0 && zoneOutOfBounds(z, frame);
                    return (
                      <tr key={z.id}>
                        <ClassicTd>
                          <button
                            type="button"
                            onClick={() => page.openEditor(z.id)}
                            className="text-[#337ab7] hover:underline inline-flex items-center gap-1.5"
                          >
                            {z.name}
                            {oob && (
                              <AlertTriangle size={14} className="text-amber-500" aria-label={t('Zone extends outside the frame')} />
                            )}
                          </button>
                        </ClassicTd>
                        <ClassicTd>{typeLabel(z.type)}</ClassicTd>
                        <ClassicTd className="tabular-nums">
                          {area.px.toLocaleString()} / {area.pct.toFixed(2)}
                        </ClassicTd>
                        <ClassicTd className="text-center">
                          <input
                            type="checkbox"
                            checked={marked.has(z.id)}
                            onChange={() => page.toggleMark(z.id)}
                            aria-label={t('Mark {{name}}', { name: z.name })}
                          />
                        </ClassicTd>
                      </tr>
                    );
                  })}
                </tbody>
              </ClassicTable>
              <RequirePerm feature="monitors" level="Edit">
                <div className={clsx('flex justify-end gap-2 mt-2')}>
                  <ClassicButton tone="primary" icon={<Plus size={14} />} onClick={() => page.openEditor('new')} disabled={!page.hasDimensions}>
                    {t('Add New Zone')}
                  </ClassicButton>
                  <ClassicButton icon={<Trash2 size={14} />} onClick={page.deleteMarked} disabled={marked.size === 0 || page.busy}>
                    {t('Delete')}
                  </ClassicButton>
                </div>
              </RequirePerm>
            </div>
          </div>
        </QueryState>
      </ClassicPage>
    </AppShell>
  );
}
