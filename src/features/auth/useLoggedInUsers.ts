import { useQuery } from '@tanstack/react-query';
import { listSessions } from '@/api/sessions';
import { useAuthStore } from '@/stores/auth';
import { useZmConfig } from '@/features/config/useZmConfig';
import { loggedInUsers, type LoggedInUser } from './phpSession';

/**
 * "Other logged in users" for the logout modal (`ajax/modals/logout.php`):
 * the PHP UI's live sessions, decoded client-side. Only fetched while the
 * modal is open and only for System viewers, as legacy gates it.
 */
export function useLoggedInUsers(enabled: boolean): { users: LoggedInUser[]; isLoading: boolean } {
  const { isAuthenticated } = useAuthStore();
  const lifetime = useZmConfig('ZM_COOKIE_LIFETIME', 3600);
  const q = useQuery({
    queryKey: ['sessions', 'logged-in'],
    queryFn: () => listSessions({ page: 1, page_size: 100 }),
    enabled: isAuthenticated && enabled,
    staleTime: 0,
  });
  return {
    users: q.data ? loggedInUsers(q.data.items, Number(lifetime) || 3600) : [],
    isLoading: q.isLoading,
  };
}
