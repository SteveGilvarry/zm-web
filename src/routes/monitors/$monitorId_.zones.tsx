import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/monitors/$monitorId_/zones')({
  component: MonitorZonesRoute,
});

function MonitorZonesRoute() {
  const { monitorId } = Route.useParams();
  return <SkinPage page="monitors.zones" monitorId={Number(monitorId)} />;
}
