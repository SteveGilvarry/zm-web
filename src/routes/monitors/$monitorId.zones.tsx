import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Square } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { getMonitor } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { ZoneEditor } from '@/features/zones/ZoneEditor';

export const Route = createFileRoute('/monitors/$monitorId/zones')({
  component: MonitorZonesPage,
});

function MonitorZonesPage() {
  const { monitorId } = Route.useParams();
  const { isAuthenticated } = useAuthStore();

  const monitorQ = useQuery({
    queryKey: ['monitor', monitorId],
    queryFn: () => getMonitor(Number(monitorId)),
    enabled: isAuthenticated && !!monitorId,
  });
  const monitor = monitorQ.data;

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link
            to="/monitors/$monitorId"
            params={{ monitorId }}
            className="inline-flex items-center gap-1 text-text-muted hover:text-cyan transition-colors"
          >
            <ArrowLeft size={14} />
            {monitor?.name ?? `Monitor ${monitorId}`}
          </Link>
          <span className="text-text-dim">/</span>
          <span className="text-text-primary">Zones</span>
        </div>

        {monitor && monitor.width && monitor.height ? (
          <Panel title="Motion zones" icon={<Square size={16} />}>
            <ZoneEditor
              monitorId={monitor.id}
              width={monitor.width}
              height={monitor.height}
            />
          </Panel>
        ) : monitorQ.isLoading ? (
          <div className="p-8 text-center text-text-muted">Loading monitor…</div>
        ) : (
          <div className="p-8 text-center text-text-muted">
            Monitor dimensions unavailable — zones require a captured frame.
          </div>
        )}
      </div>
    </AppShell>
  );
}
