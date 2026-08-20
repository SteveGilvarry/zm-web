import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Maximize2,
  Wifi,
  Radio,
  RotateCw,
  LayoutGrid,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { MosaicView } from '@/features/montage/MosaicView';
import { SavedLayoutsMenu } from '@/features/montage/SavedLayoutsMenu';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useMontagePage, useMontagePresets, type MontagePreset } from '@/features/montage/useMontagePage';
import type { Monitor } from '@/types';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Montage — Mission Control: mosaic editor + saved layouts. */
export default function MontagePage() {
  const { t } = useTranslation();
  const page = useMontagePage();
  const presets = useMontagePresets();
  useDocumentTitle(t('Montage'));
  const {
    tree, setTree, protocol, monitors, enabledMonitors, monitorById, filteredIds,
    setFilteredMonitors, streamGeneration, cellsOnScreen, gridRef, picking,
  } = page;

  // Grid presets keep their 1×1 / 2×2 labels; only the named ones translate.
  const presetLabel = (p: MontagePreset): string => {
    switch (p.id) {
      case 'banner': return t('Banner');
      case 'pip': return t('PIP');
      default: return p.label;
    }
  };

  if (!page.isAuthenticated) return null;

  return (
    <AppShell title={t('Montage')}>
      <main className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
        {/* Shared filter bar — hides cells whose monitor is filtered out. */}
        <div className="flex-shrink-0">
          <MonitorFilterBar
            monitors={monitors}
            onChange={setFilteredMonitors}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Preset layout picker */}
            <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
              <LayoutGrid size={14} className="ms-2 text-text-muted" />
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => page.applyPreset(p)}
                  className="px-2.5 py-1 rounded text-[11px] font-mono font-medium text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                  title={t('Apply {{layout}} layout', { layout: presetLabel(p) })}
                >
                  {presetLabel(p)}
                </button>
              ))}
            </div>

            {/* Saved-layout CRUD — pick a named arrangement, save the
                current one, or rename / delete the loaded one. */}
            <SavedLayoutsMenu
              currentTree={tree}
              onLoad={(next) => setTree(next)}
            />

            {/* Protocol toggle */}
            <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
              <button
                onClick={() => page.changeProtocol('webrtc')}
                className={clsx(
                  'flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors',
                  protocol === 'webrtc'
                    ? 'bg-cyan/20 text-cyan'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                <Wifi size={12} />
                WebRTC
              </button>
              <button
                onClick={() => page.changeProtocol('hls')}
                className={clsx(
                  'flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors',
                  protocol === 'hls'
                    ? 'bg-cyan/20 text-cyan'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                <Radio size={12} />
                HLS
              </button>
            </div>

            <span className="text-[10px] font-mono text-text-muted">
              {t('{{count}} cell', { count: cellsOnScreen })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={page.restartAll}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface text-text-secondary border border-border-subtle hover:border-cyan/40 hover:text-cyan transition-colors text-sm"
              title={t('Restart all streams')}
            >
              <RotateCw size={14} />
              {t('Restart')}
            </button>
            <button
              onClick={page.toggleFullscreen}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface text-text-secondary border border-border-subtle hover:border-cyan/40 hover:text-cyan transition-colors text-sm"
              title={t('Fullscreen')}
              aria-label={t('Fullscreen')}
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Mosaic viewport — fills the rest of the page height. Needs
            display:flex so the MosaicView wrapper can take its own flex
            share and resolve percentage heights inside the tree. */}
        <div ref={gridRef} dir="ltr" className="flex flex-col flex-1 min-h-0 rounded-lg bg-abyss/60 border border-border-subtle overflow-hidden">
          <MosaicView
            tree={tree}
            onChange={(next) => setTree(next)}
            renderCell={(monitorId) => {
              if (monitorId == null) return null;
              const m = monitorById.get(monitorId);
              if (!m) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs font-mono">
                    {t('Monitor {{id}} not found', { id: monitorId })}
                  </div>
                );
              }
              // Cell is occupied but filtered out — render a dimmed
              // placeholder so the layout itself isn't disturbed.
              if (!filteredIds.has(m.id)) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-abyss/60 text-text-muted text-[11px] font-mono italic">
                    {t('{{name}} (filtered)', { name: m.name })}
                  </div>
                );
              }
              return (
                <StreamCell
                  key={`${m.id}-${protocol}-${streamGeneration}`}
                  protocol={protocol}
                  monitorId={m.id}
                  monitorName={m.name}
                  orientation={m.orientation}
                  autoStart
                  compact
                  // rotationFit defaults to 'auto' — it measures the
                  // cell's actual shape and picks fill when the cell
                  // ends up portrait, fit otherwise.
                />
              );
            }}
            onSplit={page.split}
            onClose={page.close}
            onChooseMonitor={page.chooseMonitor}
          />
        </div>

        {/* Monitor picker — shown when an operator clicks a vacant cell */}
        {picking && (
          <MonitorPicker
            monitors={enabledMonitors}
            onPick={page.pickMonitor}
            onCancel={page.cancelPick}
          />
        )}
      </main>
    </AppShell>
  );
}

/* ------------------------------------------------------------------------ */
/*  Monitor picker modal                                                    */
/* ------------------------------------------------------------------------ */

function MonitorPicker({
  monitors,
  onPick,
  onCancel,
}: {
  monitors: Monitor[];
  onPick: (id: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Choose a monitor')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-80 max-w-full rounded-xl border border-cyan/40 bg-panel/95 backdrop-blur-md shadow-[0_24px_60px_rgba(0,0,0,0.5)] p-4 space-y-2">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
          {t('Choose monitor')}
        </h2>
        {monitors.length === 0 ? (
          <p className="text-xs text-text-muted italic py-4 text-center">
            {t('No capturing monitors available.')}
          </p>
        ) : (
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {monitors.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onPick(m.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-start text-sm text-text-primary hover:bg-cyan/10 hover:text-cyan transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-[10px] font-mono text-text-muted">#{m.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end pt-2 border-t border-border-subtle">
          <button
            onClick={onCancel}
            className="text-[11px] text-text-muted hover:text-text-primary"
          >
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
