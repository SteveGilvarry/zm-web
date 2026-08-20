import { ClassicMonitorsTable } from '@/features/monitors/ClassicMonitorsTable';
import { MonitorsListLayout } from '@/skins/modern/layouts/MonitorsListLayout';

/**
 * Monitors list — classic skin. The dense legacy table sits inside the
 * shared toolbar / pagination frame, exactly as the skin branch did before.
 */
export default function ClassicMonitorsListPage() {
  return (
    <MonitorsListLayout
      renderMonitors={({ filteredMonitors, liveSessionIds, clone, requestDelete, busy }) => (
        <ClassicMonitorsTable
          monitors={filteredMonitors}
          liveSessionIds={liveSessionIds}
          onClone={clone}
          onDelete={requestDelete}
          busy={busy}
        />
      )}
    />
  );
}
