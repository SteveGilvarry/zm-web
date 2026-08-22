import { useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Filter,
  Maximize2,
  Wifi,
  Radio,
  RotateCw,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MosaicView } from '@/features/montage/MosaicView';
import { SavedLayoutsMenu } from '@/features/montage/SavedLayoutsMenu';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useMonitorFilter } from '@/features/monitors/useMonitorFilter';
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
import { ToolbarDisclosure } from '../components/ToolbarDisclosure';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Runtime readout tone — grey unless something is actually wrong. */
const TONE_TEXT: Record<RuntimeTone, string> = {
  ok: 'text-fg-dim',
  warn: 'text-warn',
  down: 'text-danger',
  unknown: 'text-fg-faint',
};

const TONE_DOT: Record<RuntimeTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  down: 'bg-danger',
  unknown: 'bg-fg-faint',
};

const field = clsx(
  'bg-surface border border-border-subtle rounded',
  'text-fg focus:outline-none focus:border-accent transition-colors',
);
const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors';

// The bar reports through the shared filter store, which the page reads for
// itself (useMonitorFilter below), so its callback has nothing left to do.
const noop = () => {};

/**
 * Montage — the modern wall.
 *
 * The mosaic is the page: one control line above it, and everything the
 * operator touches once a session — the preset shapes, the saved layouts,
 * the caption position and the live-tile budget — behind two disclosures
 * rather than spread over two permanent rows (docs/DESIGN.md).
 */
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

  // The filter bar lives behind a disclosure, so the wall applies the shared
  // selections itself rather than waiting for the bar to be on screen.
  const { filtered, activeCount } = useMonitorFilter(monitors);
  useEffect(() => {
    setFilteredMonitors(filtered);
  }, [filtered, setFilteredMonitors]);

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
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <ToolbarDisclosure label={t('Layout')} icon={LayoutGrid}>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-fg-dim mb-1.5">{t('Preset shapes')}</p>
                <div role="group" aria-label={t('Layout presets')} className="flex flex-wrap items-center gap-1">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => page.applyPreset(p)}
                      className="px-2 py-1 rounded border border-border-subtle text-xs text-fg-muted hover:text-fg hover:border-border transition-colors"
                      title={t('Apply {{layout}} layout', { layout: presetLabel(p) })}
                    >
                      {presetLabel(p)}
                    </button>
                  ))}
                </div>
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
            </div>
          </ToolbarDisclosure>

          <div
            role="group"
            aria-label={t('Stream protocol')}
            className="shrink-0 flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
          >
            <button
              type="button"
              aria-pressed={protocol === 'webrtc'}
              onClick={() => page.changeProtocol('webrtc')}
              className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
                protocol === 'webrtc' ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
              )}
            >
              <Wifi size={12} aria-hidden />
              WebRTC
            </button>
            <button
              type="button"
              aria-pressed={protocol === 'hls'}
              onClick={() => page.changeProtocol('hls')}
              className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
                protocol === 'hls' ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
              )}
            >
              <Radio size={12} aria-hidden />
              HLS
            </button>
          </div>

          <span className="text-xs font-mono tabular-nums text-fg-dim">
            {t('{{count}} cell', { count: cellsOnScreen })}
          </span>

          <div className="ms-auto flex items-center gap-2 shrink-0">
            <ToolbarDisclosure label={t('Filters')} icon={Filter} count={activeCount} align="end">
              <MonitorFilterBar monitors={monitors} onChange={noop} />
            </ToolbarDisclosure>

            <ToolbarDisclosure label={t('Display')} icon={SlidersHorizontal} align="end">
              <div className="space-y-3 min-w-[16rem]">
                <label className="flex flex-col gap-1 text-xs text-fg-dim">
                  {t('Monitor status position')}
                  <select
                    aria-label={t('Monitor status position')}
                    value={statusPosition}
                    onChange={(e) => setStatusPosition(e.target.value as MontageStatusPosition)}
                    className={clsx(field, 'px-2 py-1 text-sm cursor-pointer')}
                  >
                    {(['inside', 'outside', 'hidden'] as const).map((p) => (
                      <option key={p} value={p}>{positionLabel(p)}</option>
                    ))}
                  </select>
                </label>

                <label
                  className="flex flex-col gap-1 text-xs text-fg-dim"
                  title={t('How many tiles may stream at once in this browser; the rest wait for a free slot')}
                >
                  {t('Live tile limit')}
                  <select
                    aria-label={t('Live tile limit')}
                    value={maxLiveTiles}
                    onChange={(e) => setMaxLiveTiles(Number(e.target.value))}
                    className={clsx(field, 'px-2 py-1 text-sm cursor-pointer')}
                  >
                    {[...MAX_LIVE_TILES_OPTIONS, ...(MAX_LIVE_TILES_OPTIONS.includes(maxLiveTiles as 12) ? [] : [maxLiveTiles])]
                      .sort((a, b) => a - b)
                      .map((n) => (
                        <option key={n} value={n}>{t('{{count}} live', { count: n })}</option>
                      ))}
                  </select>
                </label>
              </div>
            </ToolbarDisclosure>

            <button
              type="button"
              onClick={page.restartAll}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
              title={t('Restart all streams')}
            >
              <RotateCw size={12} aria-hidden />
              {t('Restart')}
            </button>
            <button
              type="button"
              onClick={page.toggleFullscreen}
              className={toolBtn}
              title={t('Fullscreen')}
              aria-label={t('Fullscreen')}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Mosaic viewport — the page. Needs display:flex so the MosaicView
            wrapper can take its own flex share and resolve percentage
            heights inside the tree. */}
        <div ref={gridRef} dir="ltr" className="flex flex-col flex-1 min-h-0 bg-bg-sunken overflow-hidden">
          <RequirePerm feature="stream" level="View" fallback="message">
          <MosaicView
            tree={tree}
            onChange={(next) => setTree(next)}
            renderCell={(monitorId) => {
              if (monitorId == null) return null;
              const m = monitorById.get(monitorId);
              if (!m) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center text-fg-dim text-xs">
                    {t('Monitor {{id}} not found', { id: monitorId })}
                  </div>
                );
              }
              // Cell is occupied but filtered out — render a dimmed
              // placeholder so the layout itself isn't disturbed.
              if (!filteredIds.has(m.id)) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-bg-sunken text-fg-faint text-xs">
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
          </RequirePerm>
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
    <div className="shrink-0 flex items-center gap-2 px-2 py-1 bg-surface border-t border-border-subtle min-w-0">
      <span aria-hidden className={clsx('w-1.5 h-1.5 rounded-full shrink-0', TONE_DOT[tone])} />
      <span className="text-xs text-fg truncate">{monitor.name}</span>
      {caption && (
        <span className={clsx('ms-auto text-xs font-mono tabular-nums whitespace-nowrap', TONE_TEXT[tone])}>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-80 max-w-full rounded border border-border bg-surface shadow-[var(--elevation-2)] p-4 space-y-2">
        <h2 className="text-sm font-medium text-fg mb-2">{t('Choose monitor')}</h2>
        {monitors.length === 0 ? (
          <p className="text-xs text-fg-dim py-4 text-center">
            {t('No capturing monitors available.')}
          </p>
        ) : (
          <ul className="space-y-0.5 max-h-80 overflow-y-auto">
            {monitors.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-start text-sm text-fg hover:bg-surface-2 transition-colors"
                >
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-xs font-mono tabular-nums text-fg-faint">#{m.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 rounded text-xs text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
          >
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
