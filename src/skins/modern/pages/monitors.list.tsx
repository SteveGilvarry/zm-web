import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Circle, Copy, Trash2 } from 'lucide-react';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { MonitorsListLayout } from '../layouts/MonitorsListLayout';
import { formatFps, runtimeTone, type MonitorRuntime, type RuntimeTone } from '@/features/monitors/useMonitorStatuses';
import type { Monitor as MonitorType } from '@/types';

const LENS: Record<RuntimeTone, string> = {
  ok: 'bg-emerald',
  warn: 'bg-amber',
  down: 'bg-crimson',
  unknown: 'bg-text-muted',
};

const capturingColors: Record<string, string> = {
  Always: 'bg-cyan/20 text-cyan',
  Ondemand: 'bg-amber/20 text-amber',
  None: 'bg-text-muted/20 text-text-muted',
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

/** Monitors list — Mission Control: thumbnail cards or list rows. */
export default function MonitorsListPage() {
  return (
    <MonitorsListLayout
      renderMonitors={({ filteredMonitors, liveSessions, runtimeById, viewMode, clone, requestDelete, busy }) =>
        viewMode === 'grid' ? (
          <div className="grid grid-cols-4 gap-4 stagger-children">
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
          <div className="flex flex-col gap-2 stagger-children">
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
        'group relative block rounded-xl overflow-hidden',
        'bg-surface border border-border-subtle',
        'transition-all duration-base',
        'hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10'
      )}
    >
      {/* Thumbnail */}
      <div className="aspect-video relative bg-abyss">
        <MonitorPreview
          monitorId={monitor.id}
          monitorName={monitor.name}
          orientation={monitor.orientation}
          isActive={isActive}
          enableLivePreview
        />

        {isStreaming && (
          <div className="absolute top-2 start-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 pointer-events-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson" />
            </span>
            <span className="text-xs font-mono font-bold text-white">{t('LIVE')}</span>
          </div>
        )}

        <CardActions onClone={onClone} onDelete={onDelete} busy={busy} name={monitor.name} />

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
      </div>

      {/* Info */}
      <div className="absolute inset-x-0 bottom-0 p-3 z-10 pointer-events-none">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={clsx('flex-shrink-0 w-2 h-2 rounded-full', LENS[tone])}
              title={runtime?.status}
            />
            <span className="text-sm font-medium text-white truncate">
              {monitor.name}
            </span>
          </div>
          <span className="text-xs font-mono text-text-muted">
            #{monitor.id}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span
            className={clsx(
              'text-[10px] font-mono font-medium px-1.5 py-0.5 rounded',
              capturingColors[monitor.capturing] || capturingColors['None']
            )}
          >
            {capturingLabel(monitor.capturing)}
          </span>
          {isActive && runtime ? (
            <span className={clsx('text-[10px] font-mono tabular-nums', tone === 'ok' ? 'text-text-muted' : 'text-amber')}>
              {runtime.status} · {formatFps(runtime.captureFps, i18n.language)}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
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
      className={clsx(
        'flex items-center gap-4 p-4',
        'bg-surface border border-border-subtle rounded-xl',
        'transition-all duration-base',
        'hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10'
      )}
    >
      {/* Thumbnail */}
      <div className="w-32 aspect-video relative rounded-lg overflow-hidden bg-abyss flex-shrink-0">
        <MonitorPreview
          monitorId={monitor.id}
          monitorName={monitor.name}
          orientation={monitor.orientation}
          isActive={isActive}
          compact
        />
        {isStreaming && (
          <div className="absolute top-1 start-1 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 pointer-events-none">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-crimson" />
            </span>
            <span className="text-[10px] font-mono font-bold text-white">{t('LIVE')}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx('w-2 h-2 rounded-full', LENS[tone])} title={runtime?.status} />
          <h3 className="font-medium text-text-primary truncate">
            {monitor.name}
          </h3>
          <span className="text-xs font-mono text-text-muted">
            #{monitor.id}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span
            className={clsx(
              'text-xs font-mono font-medium px-2 py-0.5 rounded',
              capturingColors[monitor.capturing] || capturingColors['None']
            )}
          >
            {capturingLabel(monitor.capturing)}
          </span>
          <span className="font-mono text-text-muted">
            {monitor.width}x{monitor.height}
          </span>
          {monitor.type && (
            <span className="text-text-muted">{monitor.type}</span>
          )}
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3 text-text-muted">
        {isStreaming && (
          <div className="flex items-center gap-1.5 text-crimson">
            <Circle className="w-2 h-2 fill-current" />
            <span className="text-xs font-mono">{t('Streaming')}</span>
          </div>
        )}
        <span className={clsx('text-xs tabular-nums', {
          'text-emerald': tone === 'ok',
          'text-amber': tone === 'warn',
          'text-crimson': tone === 'down',
          'text-text-muted': tone === 'unknown',
        })}>
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
    <div className="absolute top-2 end-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        'p-1.5 rounded bg-black/60 text-text-secondary transition-colors',
        tone === 'danger' ? 'hover:text-crimson' : 'hover:text-cyan',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}
