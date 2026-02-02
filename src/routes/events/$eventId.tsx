import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/events/$eventId')({
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();

  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Event {eventId}</h1>
        <p className="text-text-muted">Event detail view coming soon</p>
      </div>
    </div>
  );
}
