import { createFileRoute } from '@tanstack/react-router';
import { MonitorZonesRoute } from '@/features/nav/routeComponents';

export const Route = createFileRoute('/monitors/$monitorId_/zones')({
  component: MonitorZonesRoute,
});
