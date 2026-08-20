import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConfigCategories } from '@/api/configs';
import { useAuthStore } from '@/stores/auth';
import { useZmConfig } from '@/features/config/useZmConfig';
import { buildOptionsTabs, type OptionsTab } from './optionsTabs';

/**
 * The Options tab rail for pages that are not the Options page itself
 * (Users, Servers, Storage, Run State, Control). One small request for the
 * category list instead of every config row.
 */
export function useOptionsTabs(): OptionsTab[] {
  const { isAuthenticated } = useAuthStore();
  const x10Enabled = useZmConfig('ZM_OPT_X10', false);
  const { data } = useQuery({
    queryKey: ['configs', 'categories'],
    queryFn: getConfigCategories,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () => buildOptionsTabs((data ?? []).map((c) => ({ name: c.category, count: c.count })), x10Enabled),
    [data, x10Enabled],
  );
}
