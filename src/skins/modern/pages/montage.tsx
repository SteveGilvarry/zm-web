import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Maximize2,
  Wifi,
  Radio,
  RotateCw,
  LayoutGrid,
  Tag,
  Gauge,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { MosaicView } from '@/features/montage/MosaicView';
import { SavedLayoutsMenu } from '@/features/montage/SavedLayoutsMenu';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useMontagePage, useMontagePresets, type MontagePreset } from '@/features/montage/useMontagePage';
import {
  formatFps,
  runtimeTone,
  useMonitorStatuses,
  type MonitorRuntime,
  type RuntimeTone,
} from '@/features/monitors/useMonitorStatuses';
import { MAX_LIVE_TILES_OPTIONS } from '@/stores/ui';
import type { MontageStatusPosition } from '@/stores/montage';
import type { Monitor } from '@/types';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const TONE_TEXT: Record<RuntimeTone, string> = {
  ok: 'text-emerald',
  warn: 'text-amber',
  down: 'text-crimson',
  unknown: 'text-text-dim',
};

/** Montage — Mission Control: mosaic editor + saved layouts. */
export default function MontagePage() {
  const { t, i18n } = useTranslation();
  const page = useMontagePage();
  const presets = useMontagePresets();
  useDocumentTitle(t('Montage'));
  const {
    tree, setTree, protocol, monitors, enabledMonitors, monitorById, filteredIds,
    setFilteredMonitors, streamGeneration, cellsOnScreen, gridRef, picking,
    statusPosition, setStatusPosition, maxLiveTiles, setMaxLiveTiles,
  } = page;
  const { byId: runtimeById } = useMonitorStatuses(page.isAuthenticated && statusPosition !== 'hidden');

  // Grid presets keep their 1×1 / 2×2 labels; only the named ones translate.
  const presetLabel = (p: MontagePreset): string => {
    switch (p.id) {
      case 'banner': return t('Banner');
      case 'pip': return t('PIP');
      default: return p.label;
    }
  };

  const positionLabel = (p: MontageStatusPosition): string => {
    switch (p) {
      case 'inside': return t('Inside bottom');
      case 'outside': return t('Outside bottom');
      case 'hidden': return t('Hidden');
    }
  };

  const captionFor = (runtime: MonitorRuntime | undefined): string | undefined =>
    runtime ? `${runtime.status} · ${formatFps(runtime.captureFps, i18n.language)}` : undefined;

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
        <div className="flex items-center justify-between flex-shrink-0 gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
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
                current one, or update / rename / delete the loaded one. */}
            <SavedLayoutsMenu
              currentTree={tree}
              statusPosition={statusPosition}
              onLoad={(layout) => {
                setTree(layout.tree);
                if (layout.statusPosition) setStatusPosition(layout.statusPosition);
              }}
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

            {/* Caption position (legacy "Monitor status position"). */}
            <label className="flex items-center gap-1.5 bg-surface rounded-lg p-1 ps-2 border border-border-subtle text-[11px] font-mono text-text-muted">
              <Tag size={12} />
              <span className="sr-only">{t('Monitor status position')}</span>
              <select
                aria-label={t('Monitor status position')}
                value={statusPosition}
                onChange={(e) => setStatusPosition(e.target.value as MontageStatusPosition)}
                className="bg-transparent px-1 py-1 text-[11px] font-mono text-text-secondary hover:text-cyan focus:outline-none focus:text-cyan transition-colors"
              >
                {(['inside', 'outside', 'hidden'] as const).map((p) => (
                  <option key={p} value={p}>{positionLabel(p)}</option>
                ))}
              </select>
            </label>

            {/* Live-tile cap. */}
            <label
              className="flex items-center gap-1.5 bg-surface rounded-lg p-1 ps-2 border border-border-subtle text-[11px] font-mono text-text-muted"
              title={t('How many tiles may stream at once in this browser; the rest wait for a free slot')}
            >
              <Gauge size={12} />
              <span className="sr-only">{t('Live tile limit')}</span>
              <select
                aria-label={t('Live tile limit')}
                value={maxLiveTiles}
                onChange={(e) => setMaxLiveTiles(Number(e.target.value))}
                className="bg-transparent px-1 py-1 text-[11px] font-mono text-text-secondary hover:text-cyan focus:outline-none focus:text-cyan transition-colors"
              >
                {[...MAX_LIVE_TILES_OPTIONS, ...(MAX_LIVE_TILES_OPTIONS.includes(maxLiveTiles as 12) ? [] : [maxLiveTiles])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>{t('{{count}} live', { count: n })}</option>
                  ))}
              </select>
            </label>

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
              const runtime = runtimeById[m.id];
              const cell = (
                <StreamCell
                  key={`${m.id}-${protocol}-${streamGeneration}`}
                  protocol={protocol}
                  monitorId={m.id}
                  monitorName={m.name}
                  statusText={statusPosition === 'inside' ? captionFor(runtime) : undefined}
                  showName={statusPosition === 'inside'}
                  orientation={m.orientation}
                  autoStart
                  gated
                  compact
                  // rotationFit defaults to 'auto' — it measures the
                  // cell's actual shape and picks fill when the cell
                  // ends up portrait, fit otherwise.
                />
              );
              if (statusPosition !== 'outside') return cell;
              return (
                <div className="absolute inset-0 flex flex-col">
                  <div className="relative flex-1 min-h-0">{cell}</div>
                  <OutsideCaption monitor={m} runtime={runtime} caption={captionFor(runtime)} />
                </div>
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

/** Legacy "outside bottom" caption bar under a cell: name, state, fps. */
function OutsideCaption({
  monitor,
  runtime,
  caption,
}: {
  monitor: Monitor;
  runtime: MonitorRuntime | undefined;
  caption: string | undefined;
}) {
  const tone = runtimeTone(runtime?.status);
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1 bg-surface/90 border-t border-border-subtle min-w-0">
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', {
        'bg-emerald': tone === 'ok',
        'bg-amber': tone === 'warn',
        'bg-crimson': tone === 'down',
        'bg-text-dim': tone === 'unknown',
      })} />
      <span className="text-[11px] font-medium text-text-primary truncate">{monitor.name}</span>
      {caption && (
        <span className={clsx('ms-auto text-[10px] font-mono tabular-nums whitespace-nowrap', TONE_TEXT[tone])}>
          {caption}
        </span>
      )}
    </div>
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
