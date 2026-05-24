import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import {
  Maximize2,
  Wifi,
  Radio,
  RotateCw,
  LayoutGrid,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore } from '@/stores/montage';
import { MosaicView } from '@/features/montage/MosaicView';
import {
  bannerLayout,
  gridLayout,
  leaf,
  leafCount,
  leafMonitors,
  nodeAt,
  pipLayout,
  removeAt,
  setMonitorAt,
  splitAt,
  type LayoutNode,
  type Path,
} from '@/features/montage/mosaic';
import type { Monitor } from '@/types';

export const Route = createFileRoute('/montage/')({
  component: MontagePage,
});

/* ------------------------------------------------------------------------ */
/*  Preset layouts                                                          */
/* ------------------------------------------------------------------------ */

interface Preset {
  id: string;
  label: string;
  build: (monitorIds: number[]) => LayoutNode;
  /** Number of monitors a preset visually expects; layouts gracefully
   *  pad with null leaves when fewer are available. */
  size: number;
}

const PRESETS: Preset[] = [
  { id: '1x1',     label: '1×1',     size: 1, build: (m) => gridLayout(1, 1, m) },
  { id: '2x2',     label: '2×2',     size: 4, build: (m) => gridLayout(2, 2, m) },
  { id: '3x3',     label: '3×3',     size: 9, build: (m) => gridLayout(3, 3, m) },
  { id: '4x4',     label: '4×4',     size: 16, build: (m) => gridLayout(4, 4, m) },
  { id: 'banner',  label: 'Banner',  size: 4, build: bannerLayout },
  { id: 'pip',     label: 'PIP',     size: 4, build: pipLayout },
];

function MontagePage() {
  const { isAuthenticated } = useAuthStore();
  const gridRef = useRef<HTMLDivElement>(null);

  const { tree, protocol, setTree, setProtocol } = useMontageStore();

  // Generation counter — bumped to force every StreamCell to unmount and
  // remount, used by the Restart button and protocol switching to acquire
  // streams fresh.
  const [streamGeneration, setStreamGeneration] = useState(0);

  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 50 }),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const monitors: Monitor[] = monitorsData?.items ?? [];
  const enabledMonitors = monitors.filter((m) => m.capturing !== 'None');
  const monitorById = new Map(monitors.map((m) => [m.id, m]));

  // First-time hydration: if the persisted tree has no monitors assigned,
  // seed it with as many available monitors as the tree has cells.
  useEffect(() => {
    const currentLeaves = leafMonitors(tree);
    const anyAssigned = currentLeaves.some((id) => id != null);
    if (anyAssigned) return;
    if (enabledMonitors.length === 0) return;

    // Replace each null leaf in order with the next available monitor.
    const ids = enabledMonitors.map((m) => m.id);
    let idx = 0;
    const filled = mapLeaves(tree, () => {
      const next = ids[idx];
      idx += 1;
      return next != null ? leaf(next) : leaf(null);
    });
    setTree(filled);
  }, [enabledMonitors.length, tree, setTree]);

  /* ----- Layout edit handlers ------------------------------------- */

  const handleSplit = useCallback(
    (path: Path, direction: 'row' | 'column') => {
      // Pick a monitor not already on screen, if any.
      const onScreen = new Set(leafMonitors(tree).filter((v): v is number => v != null));
      const next = enabledMonitors.find((m) => !onScreen.has(m.id));
      setTree((prev) => splitAt(prev, path, direction, next?.id ?? null));
    },
    [tree, enabledMonitors, setTree],
  );

  const handleClose = useCallback(
    (path: Path) => setTree((prev) => removeAt(prev, path)),
    [setTree],
  );

  const handleApplyPreset = (preset: Preset) => {
    // Reuse currently-shown monitors first; pad with unused enabled
    // monitors; pad the rest with null.
    const onScreen = leafMonitors(tree).filter((v): v is number => v != null);
    const unused = enabledMonitors
      .map((m) => m.id)
      .filter((id) => !onScreen.includes(id));
    const seed = [...onScreen, ...unused].slice(0, preset.size);
    setTree(preset.build(seed));
  };

  const handleRestartAll = () => setStreamGeneration((g) => g + 1);

  const handleProtocolChange = (next: 'webrtc' | 'hls') => {
    if (next === protocol) return;
    setProtocol(next);
    setStreamGeneration((g) => g + 1);
  };

  const handleFullscreen = useCallback(() => {
    if (!gridRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else gridRef.current.requestFullscreen().catch(() => {});
  }, []);

  /* ----- Monitor picker for a vacant cell ------------------------- */
  const [picking, setPicking] = useState<Path | null>(null);
  const handleChooseMonitor = (path: Path) => setPicking(path);
  const handlePickMonitor = (mid: number) => {
    if (!picking) return;
    setTree((prev) => setMonitorAt(prev, picking, mid));
    setPicking(null);
  };

  if (!isAuthenticated) return null;

  const cellsOnScreen = leafCount(tree);

  return (
    <AppShell title="Montage">
      <main className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Preset layout picker */}
            <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
              <LayoutGrid size={14} className="ml-2 text-text-muted" />
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleApplyPreset(p)}
                  className="px-2.5 py-1 rounded text-[11px] font-mono font-medium text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                  title={`Apply ${p.label} layout`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Protocol toggle */}
            <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
              <button
                onClick={() => handleProtocolChange('webrtc')}
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
                onClick={() => handleProtocolChange('hls')}
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
              {cellsOnScreen} cell{cellsOnScreen === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartAll}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface text-text-secondary border border-border-subtle hover:border-cyan/40 hover:text-cyan transition-colors text-sm"
              title="Restart all streams"
            >
              <RotateCw size={14} />
              Restart
            </button>
            <button
              onClick={handleFullscreen}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface text-text-secondary border border-border-subtle hover:border-cyan/40 hover:text-cyan transition-colors text-sm"
              title="Fullscreen"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Mosaic viewport — fills the rest of the page height. Needs
            display:flex so the MosaicView wrapper can take its own flex
            share and resolve percentage heights inside the tree. */}
        <div ref={gridRef} className="flex flex-col flex-1 min-h-0 rounded-lg bg-abyss/60 border border-border-subtle overflow-hidden">
          <MosaicView
            tree={tree}
            onChange={(next) => setTree(next)}
            renderCell={(monitorId) => {
              if (monitorId == null) return null;
              const m = monitorById.get(monitorId);
              if (!m) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs font-mono">
                    Monitor {monitorId} not found
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
            onSplit={handleSplit}
            onClose={handleClose}
            onChooseMonitor={handleChooseMonitor}
          />
        </div>

        {/* Monitor picker — shown when an operator clicks a vacant cell */}
        {picking && (
          <MonitorPicker
            monitors={enabledMonitors}
            onPick={handlePickMonitor}
            onCancel={() => setPicking(null)}
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a monitor"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-80 max-w-full rounded-xl border border-cyan/40 bg-panel/95 backdrop-blur-md shadow-[0_24px_60px_rgba(0,0,0,0.5)] p-4 space-y-2">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
          Choose monitor
        </h2>
        {monitors.length === 0 ? (
          <p className="text-xs text-text-muted italic py-4 text-center">
            No capturing monitors available.
          </p>
        ) : (
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {monitors.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onPick(m.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm text-text-primary hover:bg-cyan/10 hover:text-cyan transition-colors"
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Tree helpers                                                            */
/* ------------------------------------------------------------------------ */

/** Walk the tree and replace each leaf with the result of `f`. */
function mapLeaves(node: LayoutNode, f: (l: LayoutNode & { type: 'leaf' }) => LayoutNode): LayoutNode {
  if (node.type === 'leaf') return f(node);
  return {
    ...node,
    children: node.children.map((c) => mapLeaves(c, f)),
  };
}

// Suppress an unused-import warning so nodeAt stays available for the
// drag-and-drop pass that lands next.
export const _NodeAtShim = nodeAt;
