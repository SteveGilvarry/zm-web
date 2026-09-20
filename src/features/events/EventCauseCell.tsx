import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { updateEvent } from '@/api/events';
import { listEventData } from '@/api/eventData';
import { Modal } from '@/components/common/Modal';
import { usePerms } from '@/features/auth/usePerms';
import type { ZmEvent } from '@/types';
import { EventEditForm, type EventEditValues } from './EventEditForm';

/**
 * Legacy's "Forced Web: " notes are the placeholder a manual event carries;
 * `processRows` (events.js:103) hides them rather than printing them.
 */
const PLACEHOLDER_NOTES = 'Forced Web: ';

/** Notes written by an object detector look like `detected:person(98%)`. */
function isObjectDetection(notes: string | null | undefined): boolean {
  return (notes ?? '').includes('detected:');
}

/**
 * The Cause cell of the events list, as ZoneMinder 1.39 builds it
 * (`views/js/events.js:96-104`):
 *
 *  - the cause itself opens the event-detail editor (Name / Cause / Notes),
 *    but only for a user who can edit events — otherwise it is plain text;
 *  - the notes sit underneath in small muted type;
 *  - notes from an object detector are underlined and open the object
 *    detection view instead.
 *
 * Both skins render it: it is one cell with two modals, not chrome.
 */
export function EventCauseCell({ event, tone = 'classic', showNotes = true }: {
  event: ZmEvent;
  /** Which skin's type ramp the notes line uses. */
  tone?: 'classic' | 'modern';
  /**
   * Print the notes under the cause. Off where the table has a Notes column
   * of its own — the legacy watch table puts them there instead
   * (`views/js/watch.js:91-94`).
   */
  showNotes?: boolean;
}) {
  const { t } = useTranslation();
  const { can } = usePerms();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const notes = event.notes ?? '';
  const canEdit = can('events', 'Edit');

  const save = useMutation({
    mutationFn: (values: EventEditValues) => updateEvent(event.id, {
      name: values.name.trim() || undefined,
      cause: values.cause.trim() || undefined,
      notes: values.notes.trim(),
    }),
    onSuccess: () => {
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event', event.id] });
    },
  });

  const linkCls = tone === 'classic'
    ? 'text-[#337ab7] hover:text-[#23527c] hover:underline'
    : 'text-fg hover:text-accent transition-colors';

  return (
    <>
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          // Legacy puts the notes in the link's tooltip as well.
          title={notes || undefined}
          className={linkCls}
        >
          {event.cause ?? ''}
        </button>
      ) : (
        <span title={notes || undefined}>{event.cause ?? ''}</span>
      )}

      {showNotes && <EventNotesCell event={event} tone={tone} />}

      {editOpen && (
        <EventEditForm
          isOpen
          title={t('Event {{id}}', { id: event.id })}
          initial={{ name: event.name, cause: event.cause ?? '', notes }}
          onClose={() => setEditOpen(false)}
          onSubmit={(values) => save.mutate(values)}
          pending={save.isPending}
          error={save.error ? (save.error as Error).message : null}
        />
      )}

    </>
  );
}

/**
 * The notes themselves: small muted type, or — when a detector wrote them —
 * an underlined link into the object detection view (events.js:101-105, and
 * the Notes column of the watch table, watch.js:91-94). The placeholder a
 * manually forced event carries is not printed at all.
 */
export function EventNotesCell({ event, tone = 'classic' }: {
  event: ZmEvent;
  tone?: 'classic' | 'modern';
}) {
  const [detectOpen, setDetectOpen] = useState(false);
  const notes = event.notes ?? '';
  const cls = tone === 'classic' ? 'text-xs text-zinc-500' : 'text-xs text-fg-dim';

  if (!notes || notes === PLACEHOLDER_NOTES) return null;
  if (!isObjectDetection(notes)) return <div className={cls}>{notes}</div>;

  return (
    <div>
      <button
        type="button"
        onClick={() => setDetectOpen(true)}
        className={clsx(cls, 'underline text-start')}
      >
        {notes}
      </button>
      {detectOpen && (
        <ObjectDetectionModal event={event} onClose={() => setDetectOpen(false)} />
      )}
    </div>
  );
}

/**
 * Legacy's objdetect modal shows `?view=image&eid=…&fid=objdetect` — the
 * frame the detector annotated. zm-api serves no such image, so this shows
 * what it does have: the `Event_Data` rows the detector wrote
 * (`/api/v3/event-data`), with the event's notes as the headline.
 */
function ObjectDetectionModal({ event, onClose }: { event: ZmEvent; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['eventData', event.id],
    queryFn: () => listEventData({ event_id: event.id, page: 1, page_size: 200 }),
  });
  const rows = data?.items ?? [];

  return (
    <Modal isOpen onClose={onClose} title={t('Object Detection')}>
      <div className="space-y-3 text-sm" data-testid="objdetect-modal">
        <p className="font-mono break-words">{event.notes}</p>
        {isLoading && <p className="text-fg-dim">{t('Loading…')}</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-fg-dim">{t('No detection data recorded for this event.')}</p>
        )}
        {rows.length > 0 && (
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.id} className="flex gap-3">
                <span className="font-mono tabular-nums text-fg-dim shrink-0">
                  {row.frame_id != null ? t('Frame {{id}}', { id: row.frame_id }) : t('Event')}
                </span>
                <span className="break-words">{row.data}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
