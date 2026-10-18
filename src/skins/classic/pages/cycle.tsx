import { useRef } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { StreamCell } from '@/components/common/StreamCell';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useCycleMonitors, useCyclePage } from '@/features/cycle/useCyclePage';
import { useMonitorFilterRow } from '@/features/monitors/useMonitorFilterRow';
import { useMonitorStatuses } from '@/features/monitors/useMonitorStatuses';
import { TileControls } from '@/features/montage/TileControls';
import { WebsiteTile } from '@/features/montage/WebsiteTile';
import { isWebsiteMonitor } from '@/features/montage/websiteMonitor';
import { useTileZoom } from '@/features/montage/tileZoom';
import { useAvailableHeight } from '@/features/monitors/useStageFit';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';

/** The transport row and the page padding under the stage. */
const TRANSPORT_ROW_PX = 64;
import { ClassicButton, ClassicFilterRow, ClassicPage } from '@/skins/classic/components';
import { StageSizeSelects } from '@/skins/classic/components/StageSizeSelects';

/**
 * Cycle — classic skin: legacy `?view=cycle`. Filter row + Width / Height /
 * Scale on the header band, monitor nav-pills on the left, one stage, and
 * the `<< || |> >>` transport under it.
 */
export default function ClassicCyclePage() {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const zoom = useTileZoom();
  const { allMonitors } = useCycleMonitors();
  const { byId: runtimeById } = useMonitorStatuses();
  const filter = useMonitorFilterRow(allMonitors, runtimeById);
  // What is left of the window under the stage's top edge, less the
  // transport row: legacy `scaleToFit(…, $j('#buttons'))`.
  const [stageAreaRef, availableHeight] = useAvailableHeight<HTMLDivElement>(TRANSPORT_ROW_PX);
  // The filter row's survivors are the rotation source. Every legacy move
  // is a page load, so a move resumes a paused cycle.
  const cycle = useCyclePage({ monitors: filter.filtered, reloadOnMove: true, availableHeightPx: availableHeight });
  useDocumentTitle(t('Cycle Watch'));

  if (!cycle.isAuthenticated) return null;
  const { current, index, monitors } = cycle;

  return (
    <AppShell title={t('Cycle')}>
      <div className="bg-[#485a6b] px-3 py-2 flex flex-col gap-2">
        <div className="flex items-start gap-3 flex-wrap">
          <ClassicFilterRow state={filter} tone="dark" className="flex-1" />
          <button
            type="button"
            onClick={() => cycle.setViewMode(cycle.viewMode === 'stream' ? 'stills' : 'stream')}
            className="text-sm text-cyan-200 hover:underline self-start"
            aria-pressed={cycle.viewMode === 'stills'}
          >
            {cycle.viewMode === 'stream' ? t('Stills') : t('Stream')}
          </button>
        </div>
        <div className="flex justify-center">
          <StageSizeSelects stage={cycle.stage} monitors={monitors} tone="dark" />
        </div>
      </div>

      <ClassicPage>
        <QueryState
          isLoading={cycle.isLoading}
          isError={cycle.isError}
          error={cycle.error}
          onRetry={cycle.refetch}
          empty={monitors.length === 0}
          emptyMessage={t('There are no monitors to view.')}
        >
          <div className="flex flex-col md:flex-row gap-3">
            <nav aria-label={t('Monitors')} className="md:w-64 shrink-0">
              <ul className="bg-zinc-100 rounded-sm py-1 flex md:flex-col flex-wrap gap-0.5">
                {monitors.map((m, i) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => cycle.jumpTo(i)}
                      aria-current={i === index ? 'true' : undefined}
                      className={clsx(
                        'block w-full text-center px-3 py-1.5 text-sm rounded-sm transition-colors',
                        i === index ? 'bg-[#337ab7] text-white' : 'text-[#337ab7] hover:bg-zinc-200',
                      )}
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div ref={stageAreaRef} className="flex-1 min-w-0 flex flex-col items-center gap-3">
              {current && (
                <RequirePerm feature="stream" level="View" fallback="message">
                  <div
                    ref={stageRef}
                    dir="ltr"
                    className="group relative bg-black mx-auto overflow-hidden"
                    style={cycle.stage.style}
                    data-testid="cycle-stage"
                    {...zoom.gestures}
                  >
                    <div className="absolute inset-0" style={zoom.style}>
                      {isWebsiteMonitor(current) ? (
                        <WebsiteTile monitor={current} />
                      ) : cycle.viewMode === 'stream' ? (
                        <StreamCell
                          key={current.id}
                          protocol="webrtc"
                          monitorId={current.id}
                          monitorName={current.name}
                          orientation={current.orientation}
                          autoStart
                        />
                      ) : (
                        <MonitorPreview
                          key={current.id}
                          monitorId={current.id}
                          monitorName={current.name}
                          orientation={current.orientation}
                          isActive
                          rotationFit="fill"
                        />
                      )}
                    </div>
                    <TileControls monitorId={current.id} targetRef={stageRef} zoom={zoom} />
                  </div>
                </RequirePerm>
              )}
              <div className="flex items-center gap-2" role="group" aria-label={t('Cycle controls')}>
                {/* Legacy `#buttons`: titles PreviousMonitor, PauseCycle,
                    PlayCycle, NextMonitor; no countdown. */}
                <ClassicButton tone="primary" onClick={cycle.prev} aria-label={t('Previous Monitor')} title={t('Previous Monitor')}>&lt;&lt;</ClassicButton>
                <ClassicButton tone="primary" onClick={cycle.togglePause} disabled={cycle.isPaused} aria-label={t('Pause Cycle')} title={t('Pause Cycle')}>||</ClassicButton>
                <ClassicButton tone="primary" onClick={cycle.togglePause} disabled={!cycle.isPaused} aria-label={t('Play Cycle')} title={t('Play Cycle')}>|&gt;</ClassicButton>
                <ClassicButton tone="primary" onClick={cycle.next} aria-label={t('Next Monitor')} title={t('Next Monitor')}>&gt;&gt;</ClassicButton>
              </div>
            </div>
          </div>
        </QueryState>
      </ClassicPage>
    </AppShell>
  );
}
