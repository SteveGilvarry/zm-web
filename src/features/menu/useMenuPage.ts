import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  createMenuItem,
  deleteMenuItem,
  listMenuItems,
  updateMenuItem,
  type MenuItem,
  type MenuItemInput,
} from '@/api/menuItems';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { SYSTEM_MENU_KEY } from '@/features/nav/useSystemMenu';
import { isBuiltinMenuKey } from './menuDefaults';

export const MENU_ITEMS_KEY = ['menu-items'] as const;

/** One table row: a saved item (`id`) or one added with Add and not yet saved. */
export interface MenuRow {
  rowId: string;
  id?: number;
  menuKey: string;
  builtin: boolean;
  enabled: boolean;
  label: string;
  link: string;
  icon: string;
  iconType: string;
  sortOrder: number;
}

const toRow = (item: MenuItem): MenuRow => ({
  rowId: String(item.id),
  id: item.id,
  menuKey: item.menu_key,
  builtin: isBuiltinMenuKey(item.menu_key),
  enabled: item.enabled,
  label: item.label ?? '',
  link: item.link ?? '',
  icon: item.icon ?? '',
  iconType: item.icon_type || 'material',
  sortOrder: item.sort_order,
});

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

/**
 * What Save sends for a saved row (legacy `action=menuitems`): only the
 * fields that changed. A built-in's link is not editable, so it is never
 * sent; blank label, link and icon clear the value.
 */
export function menuRowChanges(item: MenuItem, row: MenuRow): Partial<Omit<MenuItemInput, 'menu_key'>> {
  const out: Partial<Omit<MenuItemInput, 'menu_key'>> = {};
  if (item.enabled !== row.enabled) out.enabled = row.enabled;
  if ((item.label ?? null) !== orNull(row.label)) out.label = orNull(row.label);
  if (!row.builtin && (item.link ?? null) !== orNull(row.link)) out.link = orNull(row.link);
  if ((item.icon ?? null) !== orNull(row.icon)) out.icon = orNull(row.icon);
  if ((item.icon_type || 'material') !== row.iconType) out.icon_type = row.iconType;
  if (item.sort_order !== row.sortOrder) out.sort_order = row.sortOrder;
  return out;
}

export function newRowInput(row: MenuRow): MenuItemInput {
  return {
    menu_key: row.menuKey.trim(),
    enabled: row.enabled,
    label: orNull(row.label),
    link: orNull(row.link),
    icon: orNull(row.icon),
    icon_type: row.iconType,
    sort_order: row.sortOrder,
  };
}

/** Legacy `sortMenuItems`: once the order settles every row gets (position + 1) × 10. */
export function renumber(rows: readonly MenuRow[]): MenuRow[] {
  return rows.map((r, i) => ({ ...r, sortOrder: (i + 1) * 10 }));
}

/**
 * Options → Menu (`_options_menu.php`, `options.js`): one form over every
 * navbar row. Edits stay local until Save; Add appends an unsaved row;
 * Sort turns on reordering; deleting a saved row asks first and happens at
 * once, as legacy submits it on its own. Reset has no zm-api endpoint.
 */
export function useMenuPage() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = usePerms();
  const canEdit = can('system', 'Edit');
  const toast = useToast();
  const queryClient = useQueryClient();

  const listQ = useQuery({
    queryKey: MENU_ITEMS_KEY,
    queryFn: listMenuItems,
    enabled: isAuthenticated,
  });
  const saved = useMemo(
    () => [...(listQ.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [listQ.data],
  );

  // null = untouched, so the table follows the server until the first edit.
  const [draft, setDraft] = useState<MenuRow[] | null>(null);
  const rows = draft ?? saved.map(toRow);
  const edit = (fn: (rows: MenuRow[]) => MenuRow[]) => setDraft((d) => fn(d ?? saved.map(toRow)));
  const newId = useRef(0);

  const updateRow = (rowId: string, patch: Partial<MenuRow>) =>
    edit((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const addRow = () =>
    edit((rs) => [
      ...rs,
      {
        rowId: `new${newId.current++}`,
        menuKey: '',
        builtin: false,
        enabled: true,
        label: '',
        link: '',
        icon: '',
        iconType: 'material',
        sortOrder: (rs.length + 1) * 10,
      },
    ]);
  const removeNewRow = (rowId: string) => edit((rs) => rs.filter((r) => r.rowId !== rowId));

  /* ----- Sort ------------------------------------------------------------- */

  const [sorting, setSorting] = useState(false);
  const moveRow = (from: number, to: number) =>
    edit((rs) => {
      if (from === to || from < 0 || to < 0 || from >= rs.length || to >= rs.length) return rs;
      const next = [...rs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return renumber(next);
    });

  /* ----- Save --------------------------------------------------------------- */

  const [error, setError] = useState<string | null>(null);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: MENU_ITEMS_KEY });
    void queryClient.invalidateQueries({ queryKey: SYSTEM_MENU_KEY });
  };

  const saveMutation = useMutation({
    mutationFn: async (current: MenuRow[]) => {
      const byId = new Map(saved.map((i) => [i.id, i]));
      let count = 0;
      for (const row of current) {
        if (row.id == null) {
          await createMenuItem(newRowInput(row));
          count++;
          continue;
        }
        const item = byId.get(row.id);
        if (!item) continue;
        const changes = menuRowChanges(item, row);
        if (Object.keys(changes).length > 0) {
          await updateMenuItem(row.id, changes);
          count++;
        }
      }
      return count;
    },
    onSuccess: () => {
      toast.success(t('Menu saved'));
      setDraft(null);
      setSorting(false);
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.apiError(e);
    },
    onSettled: invalidate,
  });

  const save = () => {
    setError(null);
    if (rows.some((r) => r.id == null && r.menuKey.trim() === '')) {
      setError(t('A new entry needs a name.'));
      return;
    }
    saveMutation.mutate(rows);
  };

  /* ----- Delete a saved row ------------------------------------------------- */

  const [deleteTarget, setDeleteTarget] = useState<MenuRow | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMenuItem(id),
    onSuccess: (_v, id) => {
      toast.success(t('Menu entry deleted'));
      setDraft((d) => (d ? d.filter((r) => r.id !== id) : d));
    },
    onError: (e) => toast.apiError(e),
    onSettled: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  return {
    isAuthenticated,
    canEdit,
    isLoading: listQ.isLoading,
    isError: listQ.isError,
    error: listQ.error,
    refetch: () => void listQ.refetch(),
    rows,
    dirty: draft !== null,
    updateRow,
    addRow,
    removeNewRow,

    sorting,
    toggleSorting: () => setSorting((s) => !s),
    moveRow,

    save,
    isSaving: saveMutation.isPending,
    saveError: error,
    discard: () => {
      setDraft(null);
      setError(null);
    },

    /** zm-api has no endpoint that restores the default rows (zm-api#197). */
    resetAvailable: false,
    resetUnavailableReason: t('Reset needs a zm-api endpoint that does not exist yet.'),

    deleteTarget,
    requestDelete: (row: MenuRow) => setDeleteTarget(row),
    cancelDelete: () => setDeleteTarget(null),
    confirmDelete: () => {
      if (deleteTarget?.id != null) deleteMutation.mutate(deleteTarget.id);
    },
    isDeleting: deleteMutation.isPending,
  };
}
