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
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton, ClassicFilterRow, ClassicPage } from '@/skins/classic/components';
import { StageSizeSelects } from '@/skins/classic/components/StageSizeSelects';

/**
 * Cycle — classic skin: legacy `?view=cycle`. Filter row + Width / Height /
 * Scale on the header band, monitor nav-pills on the left, one stage, and
 * the `<< || |> >>` transport under it.
 */
export default function ClassicCyclePage() {
  const { t } = useTranslation();
  const { allMonitors } = useCycleMonitors();
  const { byId: runtimeById } = useMonitorStatuses();
  const filter = useMonitorFilterRow(allMonitors, runtimeById);
  // The filter row's survivors are the rotation source.
  const cycle = useCyclePage({ monitors: filter.filtered });
  useDocumentTitle(cycle.current ? t('{{name}} - Cycle', { name: cycle.current.name }) : t('Cycle'));

  if (!cycle.isAuthenticated) return null;
  const { current, index, monitors } = cycle;

  return (
    <AppShell title={t('Cycle')}>
      <div className="bg-[#485a6b] px-3 py-2 flex flex-col gap-2">
        <div className="flex items-start gap-3 flex-wrap">
          <ClassicFilterRow monitors={cycle.allMonitors} state={filter} tone="dark" className="flex-1" />
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

            <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
              {current && (
                <RequirePerm feature="stream" level="View" fallback="message">
                  <div dir="ltr" className="relative bg-black mx-auto" style={cycle.stage.style} data-testid="cycle-stage">
                    {cycle.viewMode === 'stream' ? (
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
                </RequirePerm>
              )}
              <div className="flex items-center gap-2" role="group" aria-label={t('Cycle controls')}>
                <ClassicButton tone="primary" onClick={cycle.prev} aria-label={t('Previous monitor')} title={t('Previous monitor')}>&lt;&lt;</ClassicButton>
                <ClassicButton tone="primary" onClick={cycle.togglePause} disabled={cycle.isPaused} aria-label={t('Pause cycling')} title={t('Pause cycling')}>||</ClassicButton>
                <ClassicButton tone="primary" onClick={cycle.togglePause} disabled={!cycle.isPaused} aria-label={t('Resume cycling')} title={t('Resume cycling')}>|&gt;</ClassicButton>
                <ClassicButton tone="primary" onClick={cycle.next} aria-label={t('Next monitor')} title={t('Next monitor')}>&gt;&gt;</ClassicButton>
                {!cycle.isPaused && monitors.length > 1 && (
                  <span className="text-xs text-zinc-600 tabular-nums ms-2" aria-live="off">
                    {t('{{count}}s', { count: cycle.countdown })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </QueryState>
      </ClassicPage>
    </AppShell>
  );
}
