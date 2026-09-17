import { StreamCell } from '@/components/common/StreamCell';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { WebsiteTile } from '@/features/montage/WebsiteTile';
import { isWebsiteMonitor } from '@/features/montage/websiteMonitor';
import { CycleLayout } from '../layouts/CycleLayout';

/** Cycle — modern skin. Live WebRTC stream on stage; snapshots in Stills mode. */
export default function CyclePage() {
  return (
    <CycleLayout
      renderStage={(m, mode) => isWebsiteMonitor(m) ? (
        // A WebSite monitor is a page, not a camera.
        <WebsiteTile key={m.id} monitor={m} />
      ) : mode === 'stills' ? (
        <MonitorPreview
          key={m.id}
          monitorId={m.id}
          monitorName={m.name}
          orientation={m.orientation}
          isActive
          rotationFit="fit"
        />
      ) : (
        <StreamCell
          key={m.id}
          protocol="webrtc"
          monitorId={m.id}
          monitorName={m.name}
          orientation={m.orientation}
          autoStart
        />
      )}
    />
  );
}
