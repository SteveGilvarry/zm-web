import { useTranslation } from 'react-i18next';
import { EventsListLayout } from '../layouts/EventsListLayout';
import { EventCard } from '../components/EventCard';

/** Events list — Mission Control. Card per event with thumbnail and scores. */
export default function EventsListPage() {
  const { t } = useTranslation();
  return (
    <EventsListLayout
      columnChooserVariant="modern"
      renderList={({ events, monitorLookup, accessToken, selectedIds, toggleSelected, showThumbs }) => (
        <div className="space-y-3 stagger-children">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              monitorName={monitorLookup[event.monitor_id] || t('Monitor {{id}}', { id: event.monitor_id })}
              token={accessToken}
              isSelected={selectedIds.has(event.id)}
              onToggleSelected={() => toggleSelected(event.id)}
              showThumbnail={showThumbs}
            />
          ))}
        </div>
      )}
    />
  );
}
