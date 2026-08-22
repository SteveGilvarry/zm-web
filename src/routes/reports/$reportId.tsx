import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export const Route = createFileRoute('/reports/$reportId')({
  component: ReportDetailRoute,
});

function ReportDetailRoute() {
  const { reportId } = Route.useParams();
  return <SkinPage page="reports.detail" reportId={parseInt(reportId, 10)} />;
}
