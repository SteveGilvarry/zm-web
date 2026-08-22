import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Copy, Trash2 } from 'lucide-react';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { MonitorsListLayout } from '../layouts/MonitorsListLayout';
import { formatFps, runtimeTone, type MonitorRuntime, type RuntimeTone } from '@/features/monitors/useMonitorStatuses';
import type { Monitor as MonitorType } from '@/types';
import { isOrientationRotated } from '@/types';

/** The status lamp beside a monitor's name. Colour is state, nothing else. */
const LENS: Record<RuntimeTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  down: 'bg-danger',
  unknown: 'bg-fg-faint',
};

/** Runtime readout tone — grey unless something is actually wrong. */
const RUNTIME_TEXT: Record<RuntimeTone, string> = {
  ok: 'text-fg-dim',
  warn: 'text-warn',
  down: 'text-danger',
  unknown: 'text-fg-dim',
};

/** Display label for the capturing wire value (the value itself stays raw). */
function useCapturingLabel() {
  const { t } = useTranslation();
  return (mode: string): string => {
    switch (mode) {
      case 'Always': return t('Always');
      case 'Ondemand': return t('On Demand');
      case 'None': return t('None');
      default: return mode;
    }
  };
}

/**
 * Monitors list — the modern skin.
 *
 * Grid view is a wall of thumbnails that fills the frame: the tiles size
 * themselves to the column count the viewport allows rather than sitting at
 * a quarter width with dead space around them. List view is a dense row per
 * camera for scanning a large fleet.
 */
export default function MonitorsListPage() {
  return (
    <MonitorsListLayout
      renderMonitors={({ filteredMonitors, liveSessions, runtimeById, viewMode, clone, requestDelete, busy }) =>
        viewMode === 'grid' ? (
          <div className="grid gap-3 items-start grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
            {filteredMonitors.map((monitor) => (
              <MonitorCard
                key={monitor.id}
                monitor={monitor}
                runtime={runtimeById[monitor.id]}
                isStreaming={liveSessions.includes(monitor.id)}
                onClone={() => clone(monitor.id)}
                onDelete={() => requestDelete(monitor.id, monitor.name)}
                busy={busy}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle border border-border-subtle rounded overflow-hidden">
            {filteredMonitors.map((monitor) => (
              <MonitorListItem
                key={monitor.id}
                monitor={monitor}
                runtime={runtimeById[monitor.id]}
                isStreaming={liveSessions.includes(monitor.id)}
                onClone={() => clone(monitor.id)}
                onDelete={() => requestDelete(monitor.id, monitor.name)}
                busy={busy}
              />
            ))}
          </div>
        )
      }
    />
  );
}

/** A small dot + label mark, used for the live-session flag over a tile. */
function LiveMark({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <span
      className={clsx(
        'absolute top-1 start-1 z-10 flex items-center gap-1 rounded bg-black/60 pointer-events-none',
        compact ? 'px-1 py-0.5' : 'px-1.5 py-0.5',
      )}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-recording" />
      <span className="text-xs font-medium text-white">{label}</span>
    </span>
  );
}

function MonitorCard({
  monitor,
  runtime,
  isStreaming,
  onClone,
  onDelete,
  busy,
}: {
  monitor: MonitorType;
  runtime: MonitorRuntime | undefined;
  isStreaming: boolean;
  onClone: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const capturingLabel = useCapturingLabel();
  const isActive = monitor.capturing !== 'None';
  const tone: RuntimeTone = isActive ? runtimeTone(runtime?.status) : 'unknown';

  return (
    <Link
      to="/monitors/$monitorId"
      params={{ monitorId: String(monitor.id) }}
      className={clsx(
        'group relative block rounded overflow-hidden',
        'bg-surface border border-border-subtle',
        'hover:border-accent transition-colors',
      )}
    >
      {/* The card takes the camera's shape, not 16:9 — a portrait camera in
          a landscape box is mostly black bars. */}
      <div
        className="relative bg-bg-sunken"
        style={{ aspectRatio: `${displayAspect(monitor)}` }}
      >
        <MonitorPreview
          monitorId={monitor.id}
          monitorName={monitor.name}
          orientation={monitor.orientation}
          isActive={isActive}
          enableLivePreview
          // The card now carries the camera's shape, so a rotated frame
          // should fill it rather than being scaled to fit a 16:9 box.
          rotationFit="fill"
        />

        {isStreaming && <LiveMark label={t('LIVE')} />}

        <CardActions onClone={onClone} onDelete={onDelete} busy={busy} name={monitor.name} />
      </div>

      {/* Name + state ribbon under the picture, not painted over it. */}
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className={clsx('shrink-0 w-1.5 h-1.5 rounded-full', LENS[tone])}
          />
          <span className="text-sm text-fg truncate">{monitor.name}</span>
          <span className="ms-auto text-xs font-mono tabular-nums text-fg-faint">
            #{monitor.id}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-0.5">
          <span className={clsx('text-xs', isActive ? 'text-fg-dim' : 'text-fg-faint')}>
            {capturingLabel(monitor.capturing)}
          </span>
          {isActive && runtime ? (
            <span className={clsx('ms-auto text-xs font-mono tabular-nums', RUNTIME_TEXT[tone])}>
              {runtime.status} · {formatFps(runtime.captureFps, i18n.language)}
            </span>
          ) : (
            <span className="ms-auto text-xs font-mono tabular-nums text-fg-faint">
              {monitor.width}x{monitor.height}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function MonitorListItem({
  monitor,
  runtime,
  isStreaming,
  onClone,
  onDelete,
  busy,
}: {
  monitor: MonitorType;
  runtime: MonitorRuntime | undefined;
  isStreaming: boolean;
  onClone: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const capturingLabel = useCapturingLabel();
  const isActive = monitor.capturing !== 'None';
  const tone: RuntimeTone = isActive ? runtimeTone(runtime?.status) : 'unknown';

  return (
    <Link
      to="/monitors/$monitorId"
      params={{ monitorId: String(monitor.id) }}
      className="flex items-center gap-3 px-2 py-1.5 bg-surface hover:bg-surface-2 transition-colors"
    >
      <div className="w-24 aspect-video relative rounded overflow-hidden bg-bg-sunken shrink-0">
        <MonitorPreview
          monitorId={monitor.id}
          monitorName={monitor.name}
          orientation={monitor.orientation}
          isActive={isActive}
          compact
        />
        {isStreaming && <LiveMark label={t('LIVE')} compact />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className={clsx('w-1.5 h-1.5 rounded-full shrink-0', LENS[tone])} />
          <h3 className="text-sm font-medium text-fg truncate">{monitor.name}</h3>
          <span className="text-xs font-mono tabular-nums text-fg-faint">#{monitor.id}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-fg-dim">
          <span>{capturingLabel(monitor.capturing)}</span>
          <span className="font-mono tabular-nums">
            {monitor.width}x{monitor.height}
          </span>
          {monitor.type && <span>{monitor.type}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isStreaming && (
          <span className="flex items-center gap-1.5 text-xs text-fg-dim">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-recording" />
            {t('Streaming')}
          </span>
        )}
        <span className={clsx('text-xs font-mono tabular-nums', RUNTIME_TEXT[tone])}>
          {!isActive
            ? t('Inactive')
            : runtime
              ? `${runtime.status} · ${formatFps(runtime.captureFps, i18n.language)}`
              : t('Active')}
        </span>
        <InlineActions onClone={onClone} onDelete={onDelete} busy={busy} name={monitor.name} />
      </div>
    </Link>
  );
}

// Action buttons that sit over the thumbnail in grid view. Stop propagation
// so clicks don't navigate into the monitor detail page.
function CardActions({
  onClone, onDelete, busy, name,
}: { onClone: () => void; onDelete: () => void; busy: boolean; name: string }) {
  const { t } = useTranslation();
  return (
    <div className="absolute top-1 end-1 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <ActionBtn
        title={t('Clone {{name}}', { name })}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClone(); }}
        disabled={busy}
      >
        <Copy size={14} />
      </ActionBtn>
      <ActionBtn
        title={t('Delete {{name}}', { name })}
        tone="danger"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
        disabled={busy}
      >
        <Trash2 size={14} />
      </ActionBtn>
    </div>
  );
}

// Action buttons that sit at the end of a list row.
function InlineActions({
  onClone, onDelete, busy, name,
}: { onClone: () => void; onDelete: () => void; busy: boolean; name: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1">
      <ActionBtn
        title={t('Clone {{name}}', { name })}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClone(); }}
        disabled={busy}
      >
        <Copy size={14} />
      </ActionBtn>
      <ActionBtn
        title={t('Delete {{name}}', { name })}
        tone="danger"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
        disabled={busy}
      >
        <Trash2 size={14} />
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  children, tone, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'danger' }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'p-1 rounded bg-black/60 text-white/80 transition-colors',
        tone === 'danger' ? 'hover:text-danger' : 'hover:text-white',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Width ÷ height as displayed: ZoneMinder stores a rotated camera's frame at
 * the sensor's dimensions and rotates on the way out.
 */
function displayAspect(monitor: MonitorType): number {
  const rotated = isOrientationRotated(monitor.orientation);
  const w = monitor.width || 16;
  const h = monitor.height || 9;
  return rotated ? h / w : w / h;
}
