import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/monitors/$monitorId')({
  component: MonitorWatchRoute,
});

function MonitorWatchRoute() {
  const { monitorId } = Route.useParams();
  return <SkinPage page="monitors.watch" monitorId={Number(monitorId)} />;
}
