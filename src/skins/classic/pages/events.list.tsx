import { ClassicEventsTable } from '@/features/events/ClassicEventsTable';
import { EventsListLayout } from '@/skins/modern/layouts/EventsListLayout';

/**
 * Events list — classic skin. Dense legacy-style table in place of the card
 * list; toolbar, hint and pagination are still borrowed from the Mission
 * Control layout until the classic chrome gets its own.
 */
export default function ClassicEventsListPage() {
  return (
    <EventsListLayout
      columnChooserVariant="classic"
      renderList={({ events, monitorLookup, accessToken, selectedIds, toggleSelected }) => (
        <ClassicEventsTable
          events={events}
          monitorLookup={monitorLookup}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          token={accessToken}
        />
      )}
    />
  );
}
