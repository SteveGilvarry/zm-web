import { apiGet, apiPost, apiPatch, apiDelete } from './client';

/**
 * Push token registrations (`Notifications`, zm-api#175): one row per device
 * that wants pushes, kept here for the Options → Users view of who gets
 * notified. The apps register themselves; the web UI only lists and edits.
 */
export type PushPlatform = 'android' | 'ios' | 'web';
export type PushState = 'enabled' | 'disabled';

export interface Notification {
  id: number;
  user_id?: number | null;
  token: string;
  platform?: PushPlatform | null;
  push_state?: PushState | null;
  /** Comma-separated monitor ids; empty for all. */
  monitor_list?: string | null;
  /** Minimum seconds between pushes. */
  interval: number;
  badge_count: number;
  app_version?: string | null;
  profile?: string | null;
  last_notified_at?: string | null;
  created_on?: string | null;
  updated_on: string;
}

export interface NotificationInput {
  token: string;
  platform: PushPlatform;
  push_state?: PushState | null;
  monitor_list?: string | null;
  interval?: number | null;
  badge_count?: number | null;
  app_version?: string | null;
  profile?: string | null;
  /** Only a System editor may set another user; otherwise the caller. */
  user_id?: number | null;
}

export async function listNotifications(): Promise<Notification[]> {
  return apiGet<Notification[]>('/notifications');
}

export async function getNotification(id: number): Promise<Notification> {
  return apiGet<Notification>(`/notifications/${id}`);
}

export async function createNotification(input: NotificationInput): Promise<Notification> {
  return apiPost<NotificationInput, Notification>('/notifications', input);
}

export async function updateNotification(id: number, input: Partial<NotificationInput>): Promise<Notification> {
  return apiPatch<Partial<NotificationInput>, Notification>(`/notifications/${id}`, input);
}

export async function deleteNotification(id: number): Promise<void> {
  return apiDelete(`/notifications/${id}`);
}
