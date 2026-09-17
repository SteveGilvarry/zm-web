import { useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type Ref } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { StreamCell } from '@/components/common/StreamCell';
import { ZonesOverlay } from '@/features/events/ZonesOverlay';
import { displayDimensions } from '@/features/monitors/orientation';
import { useMonitorStatuses, formatFps, runtimeTone, type MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import type { MontageStatusPosition } from '@/stores/montage';
import type { Monitor, StreamProtocol } from '@/types';
import { GRIDSTACK_COLUMNS, type GridStackItem } from './layoutFormat';
import { MONTAGE_RATIOS } from './ratio';
import { TileControls } from './TileControls';
import { useTileZoom } from './tileZoom';
import { WebsiteTile } from './WebsiteTile';
import { isWebsiteMonitor } from './websiteMonitor';

export interface MontageClassicGridProps {
  /** Monitors to display, in display order. */
  monitors: Monitor[];
  columns: number;
  protocol: StreamProtocol;
  statusPosition?: MontageStatusPosition;
  /** Legacy "Edit Layout": cells become draggable; drop reorders. */
  editMode?: boolean;
  onReorder?: (fromId: number, toId: number) => void;
  /**
   * Tile geometry on legacy's 48-column canvas. When present the wall is a
   * 48-column grid and each tile spans its own `w` columns from its own `x`,
   * so a layout with mixed tile sizes comes back the size it was saved.
   */
  items?: GridStackItem[] | null;
  /** Edit Layout resize handle: the tile's new width in grid columns. */
  onResize?: (monitorId: number, columns: number) => void;
  /** The grid element, so Save can measure the tiles. */
  gridRef?: Ref<HTMLDivElement>;
  /** Per-cell size from the Width / Height / Scale selects. */
  cellStyle?: (monitor: Monitor) => CSSProperties;
  /** Draw each monitor's zone polygons over its tile. */
  showZones?: boolean;
  /**
   * Legacy Fit: the wall becomes one absolutely-positioned canvas of this
   * height, and `cellStyle` supplies each tile's packed position.
   */
  fitHeight?: number;
  /** That tile's Ratio choice (legacy per-monitor `ratio<id>` select). */
  ratioFor?: (monitorId: number) => string;
  /** Change one tile's Ratio; the select only shows while editing. */
  onRatioChange?: (monitorId: number, ratio: string) => void;
}

/**
 * Legacy ZM-style flat montage grid: a CSS grid of live cells, each with
 * the "outside bottom" caption (name + runtime state + capture fps) unless
 * the status-position select says otherwise. Mirrors `?view=montage` —
 * no mosaic splits. The toolbar lives in the page.
 *
 * Cells are gated on viewport visibility and the live-tile budget, so a
 * 48-camera wall only streams what is on screen.
 */
export function MontageClassicGrid({
  monitors, columns, protocol, statusPosition = 'outside', editMode = false, onReorder, cellStyle,
  showZones = false, fitHeight, ratioFor, onRatioChange, items, onResize, gridRef,
}: MontageClassicGridProps) {
  const { t } = useTranslation();
  const { byId: runtimeById } = useMonitorStatuses(monitors.length > 0 && statusPosition !== 'hidden');
  const [draggingId, setDraggingId] = useState<number | null>(null);

  if (monitors.length === 0) {
    return (
      <div
        className="bg-white rounded-sm border border-zinc-300 p-12 text-center text-zinc-500 text-sm"
        data-testid="montage-classic-empty"
      >
        {t('No monitors to display.')}
      </div>
    );
  }

  // Fit packs the tiles absolutely, so the column grid steps aside there.
  const placed = fitHeight == null && items ? items : null;
  const itemById = new Map((placed ?? []).map((i) => [i.id, i]));

  return (
    // dir="ltr": the wall is physical media and never mirrors.
    <div
      dir="ltr"
      ref={gridRef}
      data-testid="montage-classic-grid"
      data-columns={placed ? GRIDSTACK_COLUMNS : columns}
      className={fitHeight == null ? 'grid gap-1' : 'relative'}
      data-fit={fitHeight == null ? undefined : 'true'}
      style={fitHeight == null
        ? { gridTemplateColumns: `repeat(${placed ? GRIDSTACK_COLUMNS : columns}, minmax(0, 1fr))` }
        : { height: fitHeight }}
    >
      {monitors.map((m) => (
        <ClassicCell
          key={m.id}
          monitor={m}
          protocol={protocol}
          runtime={runtimeById[m.id]}
          statusPosition={statusPosition}
          style={cellStyle?.(m)}
          item={itemById.get(String(m.id))}
          onResize={onResize}
          showZones={showZones}
          editMode={editMode}
          fitted={fitHeight != null}
          ratio={ratioFor?.(m.id)}
          onRatioChange={onRatioChange}
          isDragging={draggingId === m.id}
          onDragStart={() => setDraggingId(m.id)}
          onDragEnd={() => setDraggingId(null)}
          onDrop={() => { if (draggingId != null) onReorder?.(draggingId, m.id); setDraggingId(null); }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cell                                                                      */
/* -------------------------------------------------------------------------- */

const TONE_DOT: Record<ReturnType<typeof runtimeTone>, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  down: 'bg-red-500',
  unknown: 'bg-zinc-400',
};

function ClassicCell({
  monitor, protocol, runtime, statusPosition, style, showZones, editMode, fitted = false, isDragging, onDragStart, onDragEnd, onDrop,
  ratio, onRatioChange, item, onResize,
}: {
  monitor: Monitor;
  protocol: StreamProtocol;
  runtime: MonitorRuntime | undefined;
  statusPosition: MontageStatusPosition;
  style?: CSSProperties;
  /** This tile's place on the 48-column canvas, when a layout sets one. */
  item?: GridStackItem;
  onResize?: (monitorId: number, columns: number) => void;
  showZones: boolean;
  editMode: boolean;
  /** Legacy Fit: the cell is a packed box, so the frame fills what the caption leaves. */
  fitted?: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  ratio?: string;
  onRatioChange?: (monitorId: number, ratio: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const zoom = useTileZoom();
  const tone = runtimeTone(runtime?.status);
  const caption = runtime
    ? `${runtime.status} · ${formatFps(runtime.captureFps, i18n.language)}`
    : `#${monitor.id}`;
  // Legacy's gridstack resize handles. Width is all that persists there too:
  // `sizeToContent` recomputes the height from the tile, and so do we.
  const drag = useRef<{ startX: number; startW: number; columnWidth: number } | null>(null);
  const setWidth = (next: number) => {
    if (!item || !onResize) return;
    const w = Math.max(1, Math.min(GRIDSTACK_COLUMNS, next));
    if (w !== item.w) onResize(monitor.id, w);
  };
  const onHandleDown = (e: PointerEvent<HTMLButtonElement>) => {
    const grid = e.currentTarget.closest<HTMLElement>('[data-testid="montage-classic-grid"]');
    const columnWidth = grid ? grid.clientWidth / GRIDSTACK_COLUMNS : 0;
    if (!item || !columnWidth) return;
    drag.current = { startX: e.clientX, startW: item.w, columnWidth };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    setWidth(d.startW + Math.round((e.clientX - d.startX) / d.columnWidth));
  };
  const onHandleUp = (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!item) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    setWidth(item.w + step);
  };

  const dragProps = editMode ? {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLDivElement>) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); },
    onDragOver: (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); onDrop(); },
    onDragEnd,
  } : {};
  return (
    <div
      data-testid={`montage-classic-cell-${monitor.id}`}
      data-gs-id={item ? monitor.id : undefined}
      data-gs-x={item?.x}
      data-gs-w={item?.w}
      className={clsx(
        'group bg-white border border-zinc-300 rounded-sm overflow-hidden flex flex-col min-w-0 relative',
        editMode && 'cursor-grab ring-2 ring-[#337ab7]/60',
        isDragging && 'opacity-40',
      )}
      style={item ? { ...style, gridColumn: `${item.x + 1} / span ${item.w}` } : style}
      {...dragProps}
    >
      <div
        ref={frameRef}
        className={clsx('relative w-full overflow-hidden bg-zinc-900', fitted && 'flex-1 min-h-0')}
        style={fitted ? undefined : { aspectRatio: style?.aspectRatio ?? '16 / 9' }}
      >
        <div className="absolute inset-0" style={zoom.style}>
          {/* A WebSite monitor is a page, not a camera (legacy
              `Monitor::getStreamHTML` embeds it instead of a stream). */}
          {isWebsiteMonitor(monitor) ? (
            <WebsiteTile monitor={monitor} />
          ) : (
            <StreamCell
              protocol={protocol}
              monitorId={monitor.id}
              monitorName={monitor.name}
              orientation={monitor.orientation}
              showName={statusPosition === 'inside'}
              statusText={statusPosition === 'inside' && runtime ? caption : undefined}
              autoStart
              gated
              compact
            />
          )}
          {showZones && (
            <ZonesOverlay
              monitorId={monitor.id}
              monitorWidth={displayDimensions(monitor).width}
              monitorHeight={displayDimensions(monitor).height}
            />
          )}
        </div>
        {!editMode && <TileControls monitorId={monitor.id} targetRef={frameRef} zoom={zoom} />}
        {editMode && onRatioChange && (
          <select
            value={ratio ?? 'auto'}
            onChange={(e) => onRatioChange(monitor.id, e.target.value)}
            aria-label={t('Ratio for {{name}}', { name: monitor.name })}
            className="absolute top-1 end-1 z-20 rounded-sm border border-zinc-400 bg-white px-1 py-0.5 text-xs text-zinc-900"
          >
            {MONTAGE_RATIOS.map((r) => (
              <option key={r} value={r}>
                {r === 'auto' ? t('Auto') : r === 'real' ? t('Real') : r}
              </option>
            ))}
          </select>
        )}
        {statusPosition === 'hover' && (
          <div
            data-testid={`montage-classic-hover-${monitor.id}`}
            className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-2 py-1 bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          >
            <span className="truncate">{monitor.name}</span>
            <span className="ms-auto font-mono tabular-nums whitespace-nowrap">{caption}</span>
          </div>
        )}
      </div>
      {statusPosition === 'outside' && (
        <div
          className={clsx(
            'flex items-center justify-between gap-2 px-2 py-1 text-xs border-t border-zinc-200',
            'bg-zinc-50 text-zinc-700',
          )}
        >
          <Link
            to="/monitors/$monitorId"
            params={{ monitorId: String(monitor.id) }}
            className="inline-flex items-center gap-1.5 text-[#337ab7] hover:underline truncate"
          >
            <span
              className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', TONE_DOT[tone])}
              role="img"
              aria-label={runtime?.status ?? t('Unknown')}
            />
            <span className="truncate">{monitor.name}</span>
          </Link>
          <span className="font-mono text-[10px] text-zinc-500 flex-shrink-0 tabular-nums" data-testid={`montage-classic-status-${monitor.id}`}>
            {caption}
          </span>
        </div>
      )}
      {editMode && item && onResize && (
        <button
          type="button"
          role="slider"
          tabIndex={0}
          aria-label={t('Width of {{name}} in grid columns', { name: monitor.name })}
          aria-valuemin={1}
          aria-valuemax={GRIDSTACK_COLUMNS}
          aria-valuenow={item.w}
          data-testid={`montage-classic-resize-${monitor.id}`}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
          className="absolute inset-y-0 end-0 z-30 w-2 cursor-ew-resize bg-[#337ab7]/50 hover:bg-[#337ab7] touch-none"
        />
      )}
    </div>
  );
}
