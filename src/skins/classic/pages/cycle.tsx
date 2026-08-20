import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { CycleLayout } from '@/skins/modern/layouts/CycleLayout';

/**
 * Cycle — classic skin. Legacy ZM's cycle view shows a refreshing still, not
 * a live stream, so the stage is a snapshot; the layout is still borrowed
 * from Mission Control until the legacy layout (left monitor list,
 * Width/Height/Scale selects, `<< || |> >>` transport) is built.
 */
export default function ClassicCyclePage() {
  return (
    <CycleLayout
      renderStage={(m) => (
        <MonitorPreview
          key={m.id}
          monitorId={m.id}
          monitorName={m.name}
          orientation={m.orientation}
          isActive
          rotationFit="fit"
        />
      )}
    />
  );
}
