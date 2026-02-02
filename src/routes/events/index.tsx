import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/events/')({
  component: EventsPage,
});

function EventsPage() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Events</h1>
        <p className="text-text-muted">Coming soon</p>
      </div>
    </div>
  );
}
