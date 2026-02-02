import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/monitors/$monitorId')({
  component: MonitorDetailPage,
});

function MonitorDetailPage() {
  const { monitorId } = Route.useParams();

  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Monitor {monitorId}</h1>
        <p className="text-text-muted">Monitor detail view coming soon</p>
      </div>
    </div>
  );
}
