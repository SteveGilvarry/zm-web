import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Funnel, FunnelX, Maximize, Pencil, Save, Shapes, Trash2, X } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { MontageClassicGrid } from '@/features/montage/MontageClassicGrid';
import { MONTAGE_RATIOS, ratioOptionLabel } from '@/features/montage/ratio';
import { useClassicMontage } from '@/features/montage/useClassicMontage';
import { useMontageUrlParams } from '@/features/montage/useMontageUrlParams';
import { useMontageIdle } from '@/features/montage/useMontageIdle';
import { useMontageWallPage } from '@/features/montage/useMontagePage';
import { useMonitorFilterRow } from '@/features/monitors/useMonitorFilterRow';
import { useMonitorStatuses } from '@/features/monitors/useMonitorStatuses';
import { toggleFullscreen } from '@/features/montage/fullscreen';
import type { MontageStatusPosition } from '@/stores/montage';
import type { StreamProtocol } from '@/types';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { clsx } from 'clsx';
import { ClassicButton, ClassicFilterRow, ClassicIconButton, ClassicPage, ClassicSelect, classicInputClass } from '@/skins/classic/components';
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
  const url = useMontageUrlParams();
  const montage = useClassicMontage(visible, { urlLayoutId: url.layoutId });
  const { can } = usePerms();
  const idle = useMontageIdle(page.isAuthenticated && montage.monitors.length > 0);
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
      {/* Legacy `#header`; `?header=0` (kiosk) leaves it out. */}
      {!url.headerHidden && (
        <div className="relative bg-[#485a6b] px-3 py-2 text-white">
          {/* Legacy `#mfbflip`: filter_alt_off while open, filter_alt while
              closed, floated to the end of the band. */}
          <button
            type="button"
            onClick={() => montage.setPanelOpen(!montage.panelOpen)}
            aria-expanded={montage.panelOpen}
            aria-controls="mfbpanel"
            aria-label={montage.panelOpen ? t('Hide filters') : t('Show filters')}
            title={montage.panelOpen ? t('Hide filters') : t('Show filters')}
            className="absolute top-1 end-1 p-1 rounded-sm text-white hover:bg-white/10"
          >
            {montage.panelOpen ? <FunnelX size={18} aria-hidden /> : <Funnel size={18} aria-hidden />}
          </button>
          {montage.panelOpen ? (
            <div id="mfbpanel" className="flex flex-col gap-2 pe-8">
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
                  label={t('Ratio')}
                  value={montage.ratio}
                  onChange={montage.setRatio}
                  options={MONTAGE_RATIOS.map((r) => ({
                    value: r,
                    label: r === 'auto' ? t('Auto') : r === 'real' ? t('Real') : (ratioOptionLabel(r) ?? r),
                  }))}
                />
                <ClassicSelect
                  label={t('Layout')}
                  value={montage.layoutId}
                  onChange={montage.setLayoutId}
                  options={montage.layoutOptions}
                />
                {/* Legacy lets any user save their own layout; only Delete needs
                    System Edit (`delete_layout` → `enoperm()`). */}
                {montage.editMode ? (
                  <>
                    <label className="flex flex-col items-center gap-0.5 text-sm">
                      <input
                        type="text"
                        value={montage.saveName}
                        onChange={(e) => montage.setSaveName(e.target.value)}
                        placeholder={t('Enter new name for layout if desired')}
                        autoComplete="off"
                        // The filter row has a `Name` field too; this one says
                        // which name it means.
                        aria-label={t('Layout name')}
                        className={clsx(classicInputClass, 'w-64 text-zinc-900')}
                      />
                    </label>
                    <ClassicButton tone="primary" size="sm" icon={<Save size={13} />} onClick={montage.save} disabled={montage.busy}>{t('Save')}</ClassicButton>
                    <ClassicButton size="sm" icon={<X size={13} />} onClick={montage.cancelEdit}>{t('Cancel')}</ClassicButton>
                    {montage.saveError && (
                      <span role="alert" className="text-xs text-red-200">{montage.saveError}</span>
                    )}
                  </>
                ) : (
                  <ClassicButton tone="primary" size="sm" icon={<Pencil size={13} />} onClick={montage.beginEdit}>{t('Edit Layout')}</ClassicButton>
                )}
                {/* Always rendered, disabled on a preset; without System Edit the
                    click answers with legacy's "no permission" modal. */}
                <ClassicButton
                  tone="danger"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={montage.remove}
                  disabled={!montage.isSavedLayout || montage.busy}
                  aria-label={t('Delete layout')}
                  title={t('Delete layout')}
                />
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
          ) : (
            // Closed: the band keeps just the flip icon's line.
            <div className="h-5" />
          )}
        </div>
      )}

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
                items={montage.items}
                onResize={montage.resizeTile}
                gridRef={montage.gridRef}
                cellStyle={montage.stage.styleFor}
                showZones={montage.showZones}
                ratioFor={montage.ratioFor}
                onRatioChange={montage.setRatioFor}
                streamsStopped={idle.prompted}
              />
            </QueryState>
          </RequirePerm>
        </ClassicPage>
      </div>

      {/* Legacy `delconfirm` modal with key ConfirmDeleteLayout. */}
      <ConfirmDialog
        isOpen={montage.deleteConfirmOpen}
        onClose={montage.cancelDelete}
        onConfirm={montage.confirmDelete}
        title={t('Delete Confirmation')}
        message={t('Are you sure you wish to delete current layout?')}
        confirmText={t('Delete')}
        isLoading={montage.busy}
      />
      {/* `ZM_WEB_VIEWING_TIMEOUT` — legacy's `areyoustillwatching` modal. */}
      <Modal isOpen={idle.prompted} onClose={idle.resume} title={t('Are you still watching?')}>
        <p className="text-sm mb-3">{t('Video paused. Continue watching?')}</p>
        <ClassicButton tone="primary" onClick={idle.resume}>{t('Yes')}</ClassicButton>
      </Modal>
      {/* Legacy `enoperm()`. */}
      <Modal isOpen={montage.noPermOpen} onClose={montage.closeNoPerm} title={t('ZoneMinder Error')}>
        <p className="text-sm mb-1">{t('You do not have permissions to access this resource.')}</p>
        <p className="text-sm mb-3">{t('Please contact your adminstrator for details.')}</p>
        <ClassicButton onClick={montage.closeNoPerm}>{t('Close')}</ClassicButton>
      </Modal>
    </AppShell>
  );
}
