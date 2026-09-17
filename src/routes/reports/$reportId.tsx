import { createFileRoute } from '@tanstack/react-router';
import { ReportDetailRoute } from '@/features/nav/routeComponents';

export const Route = createFileRoute('/reports/$reportId')({
  component: ReportDetailRoute,
});
