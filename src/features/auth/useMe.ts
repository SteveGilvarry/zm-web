import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getMe } from '@/api/me';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';

/** Query-key prefix for the signed-in operator, so anything that changes
 *  permissions can invalidate it from anywhere. The token's subject is part
 *  of the key: signing in as someone else must not read the last user's row
 *  out of the cache. */
export const ME_QUERY_KEY = ['me'] as const;

/**
 * The signed-in operator as the server sees them right now.
 *
 * Kept fresh-ish rather than live: 5 minutes is short enough that a
 * permission change lands without a re-login, long enough that every page
 * mounting `usePerms()` does not re-ask.
 */
export function useMe(): UseQueryResult<User> {
  const { isAuthenticated, user } = useAuthStore();
  return useQuery({
    queryKey: [...ME_QUERY_KEY, user?.user ?? null],
    queryFn: getMe,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * The name to show for the signed-in operator: `/me` when it has answered,
 * the token's `user` claim until then, null when signed out. Same
 * two-source rule as `usePerms()`.
 */
export function useCurrentUsername(): string | null {
  const claimed = useAuthStore((s) => s.user?.user ?? null);
  const { data } = useMe();
  return data?.username ?? claimed;
}
