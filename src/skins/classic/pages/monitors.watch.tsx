import { useTranslation } from 'react-i18next';
import { AppShell } from '@/skins/AppShell';
import type { PagePropsMap } from '@/skins/types';
import { MonitorEditor } from '@/features/monitors/editor/MonitorEditor';
import { MonitorWatchClassic } from '@/features/monitors/MonitorWatchClassic';
import { useWatchPage } from '@/features/monitors/useWatchPage';
import { WatchLoading, WatchNotFound } from '@/skins/modern/layouts/WatchStates';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';

/** Watch — classic skin: the dense legacy-style watch view. */
export default function ClassicMonitorWatchPage({ monitorId }: PagePropsMap['monitors.watch']) {
  const { t } = useTranslation();
  const page = useWatchPage(monitorId);
  const { monitor, monitorLoading } = page;
  useDocumentTitle(monitor?.name ?? t('Watch'));

  if (!page.isAuthenticated) return null;

  if (monitorLoading) return <WatchLoading />;

  if (!monitor) return <WatchNotFound />;

  return (
    <AppShell title={monitor.name}>
      <MonitorWatchClassic
        monitor={monitor}
        stream={page.activeStream}
        protocol={page.protocol}
        onProtocolChange={page.changeProtocol}
        ptzState={page.ptzState}
        events={page.events}
        alarm={page.alarm}
        runtime={page.runtime}
        isMuted={page.isMuted}
        isFullscreen={page.isFullscreen}
        onToggleMute={page.toggleMute}
        onToggleFullscreen={page.toggleFullscreen}
        onStartStream={page.startStream}
        onStopStream={page.stopStream}
        onRetry={page.retry}
        onEditMonitor={page.openEditor}
        onRefresh={page.refresh}
      />
      {page.editorOpen && (
        <MonitorEditor monitor={monitor} onClose={page.closeEditor} />
      )}
    </AppShell>
  );
}
