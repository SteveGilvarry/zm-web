import { apiGet, apiPost, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Tag {
  id: number;
  name: string;
  create_date?: string | null;
  /** Populated on list responses by the backend; absent on detail. */
  event_count?: number | null;
}

export interface EventTagAssociation {
  event_id: number;
  tag_id: number;
  assigned_by?: number | null;
  assigned_date?: string | null;
}

export async function listTags(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Tag>> {
  return apiGet<PaginatedResponse<Tag>>(
    '/tags',
    params as Record<string, string | number | undefined>,
  );
}

export async function createTag(name: string): Promise<Tag> {
  return apiPost<{ name: string }, Tag>('/tags', { name });
}

export async function deleteTag(id: number): Promise<void> {
  return apiDelete(`/tags/${id}`);
}

/** Returns the tag with paginated events that have it attached. */
export interface TagDetail {
  id: number;
  name: string;
  create_date?: string | null;
  events: Array<{ id: number; monitor_id: number; name: string; start_date_time?: string }>;
  total_events: number;
  current_page: number;
  last_page: number;
  per_page: number;
}

export async function getTagDetail(
  id: number,
  params?: { page?: number; page_size?: number },
): Promise<TagDetail> {
  return apiGet<TagDetail>(
    `/tags/${id}`,
    params as Record<string, string | number | undefined>,
  );
}

/* ----- Event ↔ Tag associations ----------------------------------------- */

export async function attachTag(eventId: number, tagId: number): Promise<EventTagAssociation> {
  return apiPost<{ event_id: number; tag_id: number }, EventTagAssociation>(
    '/events-tags',
    { event_id: eventId, tag_id: tagId },
  );
}

export async function detachTag(eventId: number, tagId: number): Promise<void> {
  return apiDelete(`/events-tags/${tagId}/${eventId}`);
}
