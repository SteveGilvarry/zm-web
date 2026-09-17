import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize, Pencil, Save, Shapes, Trash2, X } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { MontageClassicGrid } from '@/features/montage/MontageClassicGrid';
import { useClassicMontage } from '@/features/montage/useClassicMontage';
import { useMontageWallPage } from '@/features/montage/useMontagePage';
import { useMonitorFilterRow } from '@/features/monitors/useMonitorFilterRow';
import { useMonitorStatuses } from '@/features/monitors/useMonitorStatuses';
import { toggleFullscreen } from '@/features/montage/fullscreen';
import type { MontageStatusPosition } from '@/stores/montage';
import type { StreamProtocol } from '@/types';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton, ClassicFilterRow, ClassicIconButton, ClassicPage, ClassicSelect } from '@/skins/classic/components';
import { StageSizeSelects } from '@/skins/classic/components/StageSizeSelects';

/**
 * Montage — classic skin: legacy `?view=montage`. Filter row and the
 * settings row (status position, Width / Height / Scale, Layout with
 * Edit / Save / Delete) on the header band, the flat grid below.
 */
export default function ClassicMontagePage() {
  const { t } = useTranslation();
  const page = useMontageWallPage();
  const { byId: runtimeById } = useMonitorStatuses(page.isAuthenticated);
  const filter = useMonitorFilterRow(page.monitors, runtimeById);
  const filteredIds = new Set(filter.filtered.map((m) => m.id));
  const visible = page.capturingMonitors.filter((m) => filteredIds.has(m.id));
  const montage = useClassicMontage(visible);
  const { can } = usePerms();
  // The wall element the Fullscreen button expands. Owned here rather than by
  // the hook: a ref reached through the hook's result would make every read of
  // that object a ref read (react-hooks/refs).
  const wallEl = useRef<HTMLDivElement>(null);

  useDocumentTitle(t('Montage'));

  const positionLabel = (p: MontageStatusPosition): string => {
    switch (p) {
      case 'inside': return t('Inside bottom');
      case 'outside': return t('Outside bottom');
      case 'hidden': return t('Hidden');
      case 'hover': return t('Show on hover');
    }
  };

  if (!page.isAuthenticated) return null;

  return (
    <AppShell title={t('Montage')}>
      <div className="bg-[#485a6b] px-3 py-2 flex flex-col gap-2 text-white">
        <ClassicFilterRow monitors={page.monitors} state={filter} tone="dark" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ClassicSelect
            label={t('Monitor status position')}
            value={montage.statusPosition}
            onChange={(v) => montage.setStatusPosition(v as MontageStatusPosition)}
            options={(['inside', 'outside', 'hidden', 'hover'] as const).map((p) => ({ value: p, label: positionLabel(p) }))}
          />
          <ClassicSelect
            label={t('Player')}
            value={montage.protocol}
            onChange={(v) => montage.setProtocol(v as StreamProtocol)}
            options={[{ value: 'webrtc', label: 'WebRTC' }, { value: 'hls', label: 'HLS' }]}
          />
          <StageSizeSelects stage={montage.stage} monitors={visible} tone="dark" />
          <ClassicSelect
            label={t('Layout')}
            value={montage.layoutId}
            onChange={montage.setLayoutId}
            options={montage.layoutOptions}
          />
          <RequirePerm feature="system" level="Edit">
            {montage.editMode ? (
              <>
                <ClassicButton tone="primary" size="sm" icon={<Save size={13} />} onClick={montage.save} disabled={montage.busy}>{t('Save Layout')}</ClassicButton>
                <ClassicButton size="sm" icon={<X size={13} />} onClick={montage.cancelEdit}>{t('Cancel')}</ClassicButton>
              </>
            ) : (
              <ClassicButton tone="primary" size="sm" icon={<Pencil size={13} />} onClick={montage.beginEdit}>{t('Edit Layout')}</ClassicButton>
            )}
            <ClassicButton
              tone="danger"
              size="sm"
              icon={<Trash2 size={13} />}
              onClick={montage.remove}
              disabled={!montage.isSavedLayout || montage.busy}
              aria-label={t('Delete layout')}
              title={t('Delete layout')}
            />
          </RequirePerm>
          <ClassicIconButton onClick={() => toggleFullscreen(wallEl.current)} aria-label={t('Fullscreen')}>
            <Maximize size={14} aria-hidden />
          </ClassicIconButton>
          {can('system', 'View') && (
            <ClassicIconButton
              onClick={() => montage.setShowZones(!montage.showZones)}
              aria-label={t('Show Zones')}
              aria-pressed={montage.showZones}
              className={montage.showZones ? 'bg-[#286090]' : undefined}
            >
              <Shapes size={14} aria-hidden />
            </ClassicIconButton>
          )}
        </div>
      </div>

      <div ref={wallEl} className="flex-1 min-w-0 flex flex-col bg-white">
        <ClassicPage>
          <RequirePerm feature="stream" level="View" fallback="message">
            <QueryState
              isLoading={page.isLoading}
              isError={page.isError}
              error={page.error}
              onRetry={page.refetch}
              empty={montage.monitors.length === 0}
              emptyMessage={t('No monitors to display.')}
            >
              <MontageClassicGrid
                monitors={montage.monitors}
                columns={montage.columns}
                protocol={montage.protocol}
                statusPosition={montage.statusPosition}
                editMode={montage.editMode}
                onReorder={montage.reorder}
                cellStyle={montage.stage.styleFor}
                showZones={montage.showZones}
              />
            </QueryState>
          </RequirePerm>
        </ClassicPage>
      </div>
    </AppShell>
  );
}
