import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/monitors/')({
  component: MonitorsPage,
});

function MonitorsPage() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Monitors</h1>
        <p className="text-text-muted">Coming soon</p>
      </div>
    </div>
  );
}
