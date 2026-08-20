import { StreamCell } from '@/components/common/StreamCell';
import { CycleLayout } from '../layouts/CycleLayout';

/** Cycle — Mission Control. Live WebRTC stream on stage. */
export default function CyclePage() {
  return (
    <CycleLayout
      renderStage={(m) => (
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
