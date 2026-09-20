import { Link } from '@tanstack/react-router';

import { splitEventRefs } from './eventRefs';

/** A log message with its `event NNN` references linked to the event page. */
export function LogMessage({ message, className }: { message: string; className?: string }) {
  const parts = splitEventRefs(message);
  return (
    <>
      {parts.map((part, i) =>
        part.eventId === undefined ? (
          <span key={i}>{part.text}</span>
        ) : (
          <Link
            key={i}
            to="/events/$eventId"
            params={{ eventId: String(part.eventId) }}
            className={className}
          >
            {part.text}
          </Link>
        ),
      )}
    </>
  );
}
