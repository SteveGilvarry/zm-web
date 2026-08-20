import { StreamCell } from '@/components/common/StreamCell';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { CycleLayout } from '../layouts/CycleLayout';

/** Cycle — Mission Control. Live WebRTC stream on stage; snapshots in Stills mode. */
export default function CyclePage() {
  return (
    <CycleLayout
      renderStage={(m, mode) => mode === 'stills' ? (
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
