import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getSystemMenu } from '@/api/menuItems';
import { useAuthStore } from '@/stores/auth';
import { isBuiltinMenuKey, menuItemIcon, menuItemLabel, menuItemLink } from '@/features/menu/menuDefaults';

export const SYSTEM_MENU_KEY = ['system', 'menu'] as const;

export interface SystemMenuEntry {
  id: number;
  /** `Console`, `Events`… or an operator-defined key. */
  key: string;
  /** False for an entry the operator added (legacy's custom menu rows). */
  builtin: boolean;
  /** The custom label when set, else the entry's own caption. */
  label: string;
  /**
   * Where the entry goes: the operator's Link when set, a built-in's route,
   * or `?view=<key>` for a custom entry without one. Null when a built-in
   * has no page in this dashboard (Devices, Intel GPU, Snapshots, Map).
   */
  link: string | null;
  /** The link leaves the dashboard (`http://`, `https://`). */
  external: boolean;
  icon: string;
  /** `material`, `fontawesome`, `image` or `none`. */
  iconType: string;
}

/**
 * The navbar as the operator configured it in Options → Menu: enabled
 * entries in `sort_order`, with label, link and icon overrides applied
 * (legacy `renderMenuItems()`). `entries` is null until the menu loads or
 * when the request fails, so a shell can keep its built-in order meanwhile.
 */
export function useSystemMenu() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const q = useQuery({
    queryKey: SYSTEM_MENU_KEY,
    queryFn: getSystemMenu,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const entries = useMemo<SystemMenuEntry[] | null>(() => {
    if (!q.data) return null;
    return [...q.data]
      .filter((item) => item.enabled)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((item) => {
        const link = menuItemLink(item);
        const { icon, type } = menuItemIcon(item);
        return {
          id: item.id,
          key: item.menu_key,
          builtin: isBuiltinMenuKey(item.menu_key),
          label: menuItemLabel(t, item),
          link,
          external: link != null && /^https?:\/\//i.test(link),
          icon,
          iconType: type,
        };
      });
  }, [q.data, t]);

  return { entries, isLoading: q.isLoading, isError: q.isError };
}
