import { useTranslation } from 'react-i18next';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { StreamCell } from '@/components/common/StreamCell';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MontageReviewCell } from '@/features/montagereview/MontageReviewCell';
import { MontageReviewTimeline } from '@/features/montagereview/MontageReviewTimeline';
import { REVIEW_SPEEDS, useMontageReviewPage } from '@/features/montagereview/useMontageReviewPage';
import { displayDimensions } from '@/features/monitors/orientation';
import { useMonitorFilterRow } from '@/features/monitors/useMonitorFilterRow';
import { useMonitorStatuses } from '@/features/monitors/useMonitorStatuses';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicButton, ClassicFilterRow, ClassicPage, classicInputClass } from '@/skins/classic/components';

/** `Date` → value for `<input type="datetime-local">` (local wall clock). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Montage Review — classic skin: legacy `?view=montagereview`. Filter row,
 * the Date Time >= / <= inputs, Scale and Speed sliders, the button row
 * (`< Pan`, `In +`, `Out -`, `24 Hour`, `8 Hour`, `1 Hour`, `All Events`,
 * `Live`, `Pan >`), the timeline, then the monitor canvases.
 */
export default function ClassicMontageReviewPage() {
  const { t } = useTranslation();
  const page = useMontageReviewPage();
  const { byId: runtimeById } = useMonitorStatuses(page.isAuthenticated);
  const filter = useMonitorFilterRow(page.allMonitors, runtimeById);
  useDocumentTitle(t('Montage Review'));
  const { clock, isLive, preset } = page;

  // Filter row survivors ∩ chip selection (the chip row is the modern
  // page's; here the Monitor select in the filter row plays that role).
  const filteredIds = new Set(filter.filtered.map((m) => m.id));
  const monitors = page.enabled.filter((m) => filteredIds.has(m.id) && page.selectedIds.has(m.id));

  if (!page.isAuthenticated) return null;

  const presetBtn = (value: typeof preset, label: string) => (
    <ClassicButton
      tone={preset === value ? 'primary' : 'default'}
      aria-pressed={preset === value}
      onClick={() => page.setPreset(value)}
    >
      {label}
    </ClassicButton>
  );

  return (
    <AppShell title={t('Montage Review')}>
      <div className="bg-[#485a6b] px-3 py-2 flex flex-col gap-2 text-white">
        <ClassicFilterRow monitors={page.allMonitors} state={filter} tone="dark" />
        <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-2 text-sm">
          <label className="flex flex-col items-center gap-0.5">
            <span className="font-semibold">{t('Date Time')} &gt;=</span>
            <input
              type="datetime-local"
              value={toLocalInput(clock.rangeStart)}
              onChange={(e) => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) page.setCustomRange(d, clock.rangeEnd); }}
              className={classicInputClass}
            />
          </label>
          <label className="flex flex-col items-center gap-0.5">
            <span className="font-semibold">{t('Date Time')} &lt;=</span>
            <input
              type="datetime-local"
              value={toLocalInput(clock.rangeEnd)}
              onChange={(e) => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) page.setCustomRange(clock.rangeStart, d); }}
              className={classicInputClass}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="font-semibold">{t('Scale')}</span>
            <input
              type="range" min={0.1} max={1} step={0.1}
              value={page.scale}
              onChange={(e) => page.setScale(Number(e.target.value))}
              aria-valuetext={t('{{scale}} x', { scale: page.scale.toFixed(2) })}
            />
            <span className="tabular-nums w-14">{t('{{scale}} x', { scale: page.scale.toFixed(2) })}</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="font-semibold">{t('Speed')}</span>
            <select
              value={clock.speed}
              onChange={(e) => clock.setSpeed(Number(e.target.value))}
              className="rounded-sm border border-zinc-400 bg-white px-1.5 py-0.5 text-sm text-zinc-900"
            >
              {REVIEW_SPEEDS.map((s) => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="toolbar" aria-label={t('Review range')}>
          <ClassicButton onClick={() => page.pan(-0.5)} disabled={isLive}>&lt; {t('Pan')}</ClassicButton>
          <ClassicButton onClick={() => page.zoom(0.5)} disabled={isLive}>{t('In')} +</ClassicButton>
          <ClassicButton onClick={() => page.zoom(2)} disabled={isLive}>{t('Out')} -</ClassicButton>
          {presetBtn('24h', t('24 Hour'))}
          {presetBtn('8h', t('8 Hour'))}
          {presetBtn('1h', t('1 Hour'))}
          {presetBtn('all', t('All Events'))}
          {presetBtn('live', t('Live'))}
          <ClassicButton onClick={() => page.pan(0.5)} disabled={isLive}>{t('Pan')} &gt;</ClassicButton>
          {!isLive && (
            <ClassicButton tone={clock.isPlaying ? 'primary' : 'default'} onClick={clock.togglePlay} aria-pressed={clock.isPlaying}>
              {clock.isPlaying ? t('Pause') : t('Play')}
            </ClassicButton>
          )}
        </div>
      </div>

      <ClassicPage>
        <QueryState
          isLoading={page.isLoading}
          isError={page.isError}
          error={page.error}
          onRetry={page.refetch}
          empty={monitors.length === 0}
          emptyMessage={t('Select one or more monitors to review.')}
        >
          {!isLive && (
            <div dir="ltr" className="mb-3">
              <MontageReviewTimeline
                monitors={monitors}
                rangeStart={clock.rangeStart}
                rangeEnd={clock.rangeEnd}
                currentTime={clock.currentTime}
                onSeek={clock.setCurrentTime}
              />
            </div>
          )}
          <RequirePerm feature={isLive ? 'stream' : 'events'} level="View" fallback="message">
            <div dir="ltr" className="flex flex-wrap gap-1 justify-center" data-testid="review-classic-grid">
              {monitors.map((m) => {
                const dims = displayDimensions(m);
                const width = Math.max(120, Math.round(dims.width * page.scale * 0.5));
                return (
                  <div
                    key={m.id}
                    className="relative bg-black border"
                    style={{ width, maxWidth: '100%', aspectRatio: `${dims.width} / ${dims.height}`, borderColor: m.web_colour || '#ffffff' }}
                    title={`${m.id} ${m.name}`}
                  >
                    {isLive ? (
                      <StreamCell protocol="hls" monitorId={m.id} monitorName={m.name} orientation={m.orientation} autoStart compact />
                    ) : (
                      <MontageReviewCell
                        monitor={m}
                        currentTime={clock.currentTime}
                        rangeStart={clock.rangeStart}
                        rangeEnd={clock.rangeEnd}
                        isPlaying={clock.isPlaying}
                        speed={clock.speed}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </RequirePerm>
        </QueryState>
      </ClassicPage>
    </AppShell>
  );
}
