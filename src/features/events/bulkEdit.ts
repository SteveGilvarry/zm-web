import type { EventUpdatePayload } from '@/api/events';
import type { EventEditValues } from './EventEditForm';

/** PATCH body for a bulk edit; blank fields are left out so they stay as they are. */
export function bulkEditPayload(values: EventEditValues): EventUpdatePayload {
  const payload: EventUpdatePayload = {};
  if (values.name.trim()) payload.name = values.name.trim();
  if (values.cause.trim()) payload.cause = values.cause.trim();
  if (values.notes.trim()) payload.notes = values.notes.trim();
  if (values.archived === 'archive') payload.archived = true;
  if (values.archived === 'unarchive') payload.archived = false;
  return payload;
}
