import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  RefreshCw,
  Pencil,
  AlertTriangle,
  Bell,
  Maximize2,
  Volume2,
  VolumeX,
  Play,
  Square,
} from 'lucide-react';
import type { Monitor, ZmEvent } from '@/types';
import { controlMonitorAlarm } from '@/api/monitors';
import { PtzControls } from '@/features/ptz/PtzControls';
import type { PtzState } from '@/features/ptz/usePtz';
import type { StreamHookResult } from '@/hooks/useWebRtcStream';
import type { StreamProtocol } from '@/types';

interface MonitorWatchClassicProps {
  monitor: Monitor;
  stream: StreamHookResult;
  protocol: StreamProtocol;
  onProtocolChange: (p: StreamProtocol) => void;
  ptzState: PtzState;
  events: ZmEvent[];
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onStartStream: () => void;
  onStopStream: () => void;
  onRetry: () => void;
  onEditMonitor: () => void;
  onRefresh: () => void;
}

/**
 * Classic-skin Watch (single monitor) page. Mirrors the legacy ZM
 * `?view=watch&mid=<id>` layout: large stream on the left, dense control
 * sidebar on the right with monitor metadata, PTZ panel, recent events,
 * and the legacy action buttons (Edit, Refresh, Force Alarm, Back).
 *
 * Data-fetching and stream-control hooks live in the parent route so this
 * component stays a thin, testable presentational layer — it receives the
 * `monitor`, `stream`, `ptzState` and `events` and only renders.
 */
export function MonitorWatchClassic({
  monitor,
  stream,
  protocol,
  onProtocolChange,
  ptzState,
  events,
  isMuted,
  onToggleMute,
  onToggleFullscreen,
  onStartStream,
  onStopStream,
  onRetry,
  onEditMonitor,
  onRefresh,
}: MonitorWatchClassicProps) {
  const { t } = useTranslation();
  const [alarmError, setAlarmError] = useState<string | null>(null);

  // Destructure non-ref fields so the React compiler's "no refs during
  // render" rule doesn't flag every `stream.state` read — those scalar
  // fields are safe in the render path; only `videoRef` is the actual ref.
  const { videoRef, state: streamState, error: streamError, hasAudio } = stream;

  const forceAlarmMutation = useMutation({
    mutationFn: () => controlMonitorAlarm(monitor.id, { action: 'on', cause: 'API', score: 100 }),
    onMutate: () => setAlarmError(null),
    onError: (err: unknown) =>
      setAlarmError(err instanceof Error ? err.message : t('Failed to force alarm')),
  });

  const cancelAlarmMutation = useMutation({
    mutationFn: () => controlMonitorAlarm(monitor.id, { action: 'cancel' }),
    onMutate: () => setAlarmError(null),
    onError: (err: unknown) =>
      setAlarmError(err instanceof Error ? err.message : t('Failed to cancel alarm')),
  });

  const handleForceAlarm = () => {
    if (window.confirm(t('Force alarm on "{{name}}"? This creates an event right now.', { name: monitor.name }))) {
      forceAlarmMutation.mutate();
    }
  };

  const isEnabled = monitor.capturing !== 'None';
  const isConnecting = streamState === 'connecting' || streamState === 'signaling';
  const isStreaming = streamState === 'connected';
  const isActive = streamState !== 'idle';

  return (
    <main className="p-4 lg:p-6">
      {/* Breadcrumb row */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Link
            to="/monitors"
            className="inline-flex items-center gap-1 text-cyan-700 hover:underline"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" />
            {t('Monitors')}
          </Link>
          <span className="text-zinc-400">/</span>
          <span className="text-zinc-700 font-medium">{monitor.name}</span>
          <span className="ms-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-zinc-200 text-zinc-600 border border-zinc-300">
            {t('id={{id}}', { id: monitor.id })}
          </span>
        </div>

        {/* Action row (legacy ZM cluster) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ClassicButton onClick={() => window.history.back()} title={t('Back')}>
            <ArrowLeft size={12} className="rtl:-scale-x-100" />
            {t('Back')}
          </ClassicButton>
          <ClassicButton onClick={onRefresh} title={t('Refresh')}>
            <RefreshCw size={12} />
            {t('Refresh')}
          </ClassicButton>
          <ClassicButton onClick={onEditMonitor} title={t('Edit monitor configuration')}>
            <Pencil size={12} />
            {t('Edit')}
          </ClassicButton>
          <ClassicButton
            onClick={handleForceAlarm}
            disabled={!isEnabled || forceAlarmMutation.isPending}
            tone="danger"
            title={t('Force alarm — creates an event immediately')}
          >
            <Bell size={12} />
            {forceAlarmMutation.isPending ? t('Forcing…') : t('Force Alarm')}
          </ClassicButton>
          {forceAlarmMutation.isSuccess && (
            <ClassicButton
              onClick={() => cancelAlarmMutation.mutate()}
              disabled={cancelAlarmMutation.isPending}
              title={t('Cancel forced alarm')}
            >
              {t('Cancel Alarm')}
            </ClassicButton>
          )}
        </div>
      </div>

      {alarmError && (
        <div className="mb-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle size={12} />
          {alarmError}
        </div>
      )}

      {/* Stage + sidebar split */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* LEFT — large stream area */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                {t('Live view')}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
                {protocol === 'webrtc' ? 'WebRTC' : 'HLS'}
                {isStreaming && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t('LIVE')}
                  </span>
                )}
              </div>
            </div>

            <div
              dir="ltr"
              className="relative bg-black w-full"
              style={{
                aspectRatio: `${monitor.width || 16} / ${monitor.height || 9}`,
              }}
            >
              <video
                ref={videoRef}
                className={clsx(
                  'w-full h-full object-contain bg-black',
                  !isActive && 'hidden',
                )}
                autoPlay
                muted={isMuted}
                playsInline
              />

              {isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
                  {t('Connecting…')}
                </div>
              )}

              {streamError && streamState === 'failed' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
                  <AlertTriangle size={28} className="text-amber-400 mb-2" />
                  <p className="text-sm mb-2 max-w-xs text-center">{streamError}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="px-3 py-1.5 text-xs rounded bg-cyan-600 text-white hover:bg-cyan-700"
                  >
                    {t('Retry')}
                  </button>
                </div>
              )}

              {!isActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400">
                  {isEnabled ? (
                    <>
                      <p className="mb-3 text-sm">{t('Stream not active')}</p>
                      <button
                        type="button"
                        onClick={onStartStream}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700"
                      >
                        <Play size={12} />
                        {t('Start Stream')}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm">{t('Monitor is disabled')}</p>
                  )}
                </div>
              )}

              {/* Overlay: monitor name + id, top-left */}
              {(isActive || isStreaming) && (
                <div className="absolute top-2 start-2 px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-mono">
                  {t('{{name}} (id={{id}})', { name: monitor.name, id: monitor.id })}
                </div>
              )}
            </div>

            {/* DVR transport row (live mode subset) */}
            <div className="px-3 py-2 border-t border-zinc-200 bg-zinc-50 flex items-center gap-2 flex-wrap">
              <ClassicButton
                onClick={onStopStream}
                disabled={!isActive}
                title={t('Stop stream')}
              >
                <Square size={12} />
                {t('Stop')}
              </ClassicButton>
              <ClassicButton
                onClick={onStartStream}
                disabled={isActive}
                title={t('Play stream')}
              >
                <Play size={12} />
                {t('Play')}
              </ClassicButton>

              <span className="text-zinc-300 mx-1">|</span>

              {hasAudio && (
                <ClassicButton onClick={onToggleMute} title={t('Mute / unmute audio')}>
                  {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  {isMuted ? t('Muted') : t('Audio')}
                </ClassicButton>
              )}
              <ClassicButton onClick={onToggleFullscreen} title={t('Fullscreen stage')}>
                <Maximize2 size={12} />
                {t('Fullscreen')}
              </ClassicButton>

              <span className="text-zinc-300 mx-1">|</span>

              <Link
                to="/events"
                search={{ monitor_id: monitor.id }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-cyan-700 text-xs"
              >
                {t('All Events')}
              </Link>

              <span className="text-zinc-300 mx-1">|</span>

              <label className="inline-flex items-center gap-1 text-xs text-zinc-600">
                <span className="font-mono uppercase tracking-wider text-[10px] text-zinc-500">
                  {t('Protocol')}
                </span>
                <select
                  value={protocol}
                  onChange={(e) => onProtocolChange(e.target.value as StreamProtocol)}
                  className="px-1.5 py-0.5 rounded border border-zinc-300 bg-white text-xs font-mono"
                  aria-label={t('Stream protocol')}
                >
                  <option value="webrtc">WebRTC</option>
                  <option value="hls">HLS</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT — dense control sidebar */}
        <div className="lg:w-[22rem] lg:flex-shrink-0 space-y-4">
          {/* Monitor metadata — form-table style */}
          <ClassicCard title={t('Monitor')}>
            <table className="w-full text-xs text-zinc-800">
              <tbody>
                <MetaRow label={t('Name')} value={monitor.name} />
                <MetaRow label={t('Function')} value={monitor.function || '—'} />
                <MetaRow
                  label={t('Capturing')}
                  value={monitor.capturing || 'None'}
                  highlight={monitor.capturing === 'Always' ? 'good' : undefined}
                />
                <MetaRow
                  label={t('Analysing')}
                  value={monitor.analysing || 'None'}
                  highlight={monitor.analysing === 'Always' ? 'warn' : undefined}
                />
                <MetaRow
                  label={t('Recording')}
                  value={monitor.recording || 'None'}
                  highlight={monitor.recording === 'Always' ? 'danger' : undefined}
                />
                <MetaRow
                  label={t('Decoding')}
                  value={monitor.decoding_enabled === 1 ? t('Enabled') : t('Disabled')}
                />
                <MetaRow label={t('Type')} value={monitor.type || '—'} />
                <MetaRow label={t('Source')} value={monitor.host || '—'} mono />
                {monitor.port && <MetaRow label={t('Port')} value={monitor.port} mono />}
                {monitor.path && <MetaRow label={t('Path')} value={monitor.path} mono truncate />}
                {monitor.user && <MetaRow label={t('User')} value={monitor.user} mono />}
                <MetaRow
                  label={t('Resolution')}
                  value={`${monitor.width}×${monitor.height}`}
                  mono
                />
                <MetaRow label={t('Colour')} value={t('{{bits}} bit', { bits: monitor.colours })} mono />
                <MetaRow label={t('Orientation')} value={monitor.orientation || 'Rotate0'} />
                <MetaRow
                  label={t('Max FPS')}
                  value={monitor.max_fps != null ? String(monitor.max_fps) : t('Unlimited')}
                  mono
                />
                <MetaRow label={t('Storage')} value={String(monitor.storage_id)} mono />
                <MetaRow label={t('Server')} value={monitor.server_id != null ? String(monitor.server_id) : t('Local')} mono />
                <MetaRow label={t('Zones')} value={String(monitor.zone_count ?? 0)} mono />
                {monitor.event_prefix && (
                  <MetaRow label={t('Event Prefix')} value={monitor.event_prefix} mono />
                )}
                <MetaRow label={t('Importance')} value={monitor.importance || 'Normal'} />
              </tbody>
            </table>
          </ClassicCard>

          {/* Quick links */}
          <ClassicCard title={t('Actions')}>
            <div className="flex flex-wrap gap-1.5">
              <Link
                to="/monitors/$monitorId/zones"
                params={{ monitorId: String(monitor.id) }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-cyan-700 text-xs"
              >
                {t('Zones')}
              </Link>
              <Link
                to="/events"
                search={{ monitor_id: monitor.id }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-cyan-700 text-xs"
              >
                {t('Events')}
              </Link>
              <button
                type="button"
                onClick={onEditMonitor}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-cyan-700 text-xs"
              >
                <Pencil size={11} />
                {t('Configure')}
              </button>
            </div>
          </ClassicCard>

          {/* PTZ — only when capabilities resolved. The PtzControls component
              keeps its modern instrument-console styling intentionally; the
              cyan colour palette is theme-neutral and reads fine inside a
              classic white card. */}
          {ptzState.status === 'ready' && (
            <ClassicCard
              title={
                <span className="flex items-center gap-2">
                  {t('Camera control')}
                  {ptzState.capabilities.protocol && (
                    <span className="text-[10px] font-mono uppercase tracking-wider bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">
                      {ptzState.capabilities.protocol}
                    </span>
                  )}
                </span>
              }
            >
              <PtzControls monitorId={monitor.id} capabilities={ptzState.capabilities} />
            </ClassicCard>
          )}

          {/* Recent events — dense table */}
          <ClassicCard
            title={t('Recent events')}
            action={
              <Link
                to="/events"
                search={{ monitor_id: monitor.id }}
                className="text-[11px] text-cyan-700 hover:underline"
              >
                {t('All events')}
              </Link>
            }
          >
            {events.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2 text-center">{t('No recent events')}</p>
            ) : (
              <table className="w-full text-xs text-zinc-800">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                  <tr>
                    <th className="text-start py-1 pe-2 font-semibold">{t('ID')}</th>
                    <th className="text-start py-1 pe-2 font-semibold">{t('Name')}</th>
                    <th className="text-start py-1 pe-2 font-semibold">{t('Cause')}</th>
                    <th className="text-end py-1 font-semibold">{t('Start')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50"
                    >
                      <td className="py-1 pe-2 font-mono text-zinc-500">
                        <Link
                          to="/events/$eventId"
                          params={{ eventId: String(e.id) }}
                          className="text-cyan-700 hover:underline"
                        >
                          {e.id}
                        </Link>
                      </td>
                      <td className="py-1 pe-2 truncate max-w-[8rem]">
                        <Link
                          to="/events/$eventId"
                          params={{ eventId: String(e.id) }}
                          className="text-zinc-800 hover:text-cyan-700"
                        >
                          {e.name}
                        </Link>
                      </td>
                      <td className="py-1 pe-2 text-zinc-600 truncate max-w-[6rem]">
                        {e.cause || '—'}
                      </td>
                      <td className="py-1 text-end font-mono text-zinc-500 tabular-nums">
                        {e.start_date_time
                          ? new Date(e.start_date_time).toLocaleTimeString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ClassicCard>
        </div>
      </div>
    </main>
  );
}

interface ClassicCardProps {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function ClassicCard({ title, action, children }: ClassicCardProps) {
  return (
    <div className="bg-white border border-zinc-300 rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
          {title}
        </span>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

interface MetaRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  truncate?: boolean;
  highlight?: 'good' | 'warn' | 'danger';
}

function MetaRow({ label, value, mono, truncate, highlight }: MetaRowProps) {
  return (
    <tr className="border-b border-zinc-100 last:border-b-0">
      <td className="py-1 pe-3 text-zinc-500 align-top w-1/3">{label}</td>
      <td
        className={clsx(
          'py-1 align-top',
          mono && 'font-mono',
          truncate && 'truncate max-w-[12rem]',
          highlight === 'good' && 'text-emerald-700 font-medium',
          highlight === 'warn' && 'text-amber-700 font-medium',
          highlight === 'danger' && 'text-red-700 font-medium',
        )}
      >
        {value}
      </td>
    </tr>
  );
}

interface ClassicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'danger';
}

function ClassicButton({
  tone = 'default',
  className,
  children,
  ...rest
}: ClassicButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        tone === 'danger'
          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400'
          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-cyan-700',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
