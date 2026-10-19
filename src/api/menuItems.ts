import { apiGet, apiPost, apiPut, apiDelete } from './client';

/**
 * The navbar's rows (`MenuItems`, zm-api#144): legacy's Options → Menu tab
 * lets the operator hide, relabel, re-link and reorder entries; the header
 * then renders `GET /system/menu` (enabled rows in order). Unpaginated.
 */
export interface MenuItem {
  id: number;
  /** The navbar entry this row configures: `Console`, `Watch`, `Montage`… */
  menu_key: string;
  enabled: boolean;
  /** Shown instead of the entry's default label. */
  label?: string | null;
  link?: string | null;
  icon?: string | null;
  /** `material`, `fontawesome`, `image` or `none`. */
  icon_type: string;
  sort_order: number;
}

export interface MenuItemInput {
  menu_key: string;
  enabled?: boolean | null;
  label?: string | null;
  link?: string | null;
  icon?: string | null;
  icon_type?: string | null;
  sort_order?: number | null;
}

/** Every row, hidden ones included: the Options → Menu table. */
export async function listMenuItems(): Promise<MenuItem[]> {
  return apiGet<MenuItem[]>('/menu-items');
}

/** Enabled rows in display order: what the header shows. */
export async function getSystemMenu(): Promise<MenuItem[]> {
  return apiGet<MenuItem[]>('/system/menu');
}

export async function getMenuItem(id: number): Promise<MenuItem> {
  return apiGet<MenuItem>(`/menu-items/${id}`);
}

export async function createMenuItem(input: MenuItemInput): Promise<MenuItem> {
  return apiPost<MenuItemInput, MenuItem>('/menu-items', input);
}

export async function updateMenuItem(id: number, input: Partial<Omit<MenuItemInput, 'menu_key'>>): Promise<MenuItem> {
  return apiPut<Partial<Omit<MenuItemInput, 'menu_key'>>, MenuItem>(`/menu-items/${id}`, input);
}

export async function deleteMenuItem(id: number): Promise<void> {
  return apiDelete(`/menu-items/${id}`);
}
