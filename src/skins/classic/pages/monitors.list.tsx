import ClassicConsolePage from './console';

/**
 * Monitors list — classic skin. Legacy ZoneMinder has no separate monitors
 * page: the Console table *is* the list (Add / Clone / Edit / Delete live on
 * its toolbar), so `/monitors` renders the Console. `?new=true` still opens
 * the Add dialog there.
 */
export default function ClassicMonitorsListPage() {
  return <ClassicConsolePage />;
}
