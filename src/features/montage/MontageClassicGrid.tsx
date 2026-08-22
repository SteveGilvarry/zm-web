import { useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { StreamCell } from '@/components/common/StreamCell';
import { useMonitorStatuses, formatFps, runtimeTone, type MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import type { MontageStatusPosition } from '@/stores/montage';
import type { Monitor, StreamProtocol } from '@/types';

export interface MontageClassicGridProps {
  /** Monitors to display, in display order. */
  monitors: Monitor[];
  columns: number;
  protocol: StreamProtocol;
  statusPosition?: MontageStatusPosition;
  /** Legacy "Edit Layout": cells become draggable; drop reorders. */
  editMode?: boolean;
  onReorder?: (fromId: number, toId: number) => void;
  /** Per-cell size from the Width / Height / Scale selects. */
  cellStyle?: (monitor: Monitor) => CSSProperties;
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

  return (
    // dir="ltr": the wall is physical media and never mirrors.
    <div
      dir="ltr"
      data-testid="montage-classic-grid"
      data-columns={columns}
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {monitors.map((m) => (
        <ClassicCell
          key={m.id}
          monitor={m}
          protocol={protocol}
          runtime={runtimeById[m.id]}
          statusPosition={statusPosition}
          style={cellStyle?.(m)}
          editMode={editMode}
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
  monitor, protocol, runtime, statusPosition, style, editMode, isDragging, onDragStart, onDragEnd, onDrop,
}: {
  monitor: Monitor;
  protocol: StreamProtocol;
  runtime: MonitorRuntime | undefined;
  statusPosition: MontageStatusPosition;
  style?: CSSProperties;
  editMode: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { t, i18n } = useTranslation();
  const tone = runtimeTone(runtime?.status);
  const caption = runtime
    ? `${runtime.status} · ${formatFps(runtime.captureFps, i18n.language)}`
    : `#${monitor.id}`;
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
      className={clsx(
        'bg-white border border-zinc-300 rounded-sm overflow-hidden flex flex-col min-w-0',
        editMode && 'cursor-grab ring-2 ring-[#337ab7]/60',
        isDragging && 'opacity-40',
      )}
      style={style}
      {...dragProps}
    >
      <div className="relative w-full bg-zinc-900" style={{ aspectRatio: style?.aspectRatio ?? '16 / 9' }}>
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
    </div>
  );
}
