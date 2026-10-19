import { useQuery } from '@tanstack/react-query';
import { listRoles, type Role } from '@/api/roles';
import { getUsers } from '@/api/users';
import { useAuthStore } from '@/stores/auth';

/** The API caps `page_size` at 1000; one request covers any real install. */
const ALL = 1000;

export const ALL_ROLES_KEY = ['roles', 'all'] as const;
/** Same key and request as the Users page, so the two share one cache entry. */
export const ALL_USERS_KEY = ['users', 'all'] as const;

/** Every role, by name: legacy lists them `['order'=>'Name']`. */
export function useAllRoles() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ALL_ROLES_KEY,
    queryFn: async (): Promise<Role[]> => {
      const page = await listRoles({ page: 1, page_size: ALL });
      return [...page.items].sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: isAuthenticated,
  });
}

export function useAllUsers() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ALL_USERS_KEY,
    queryFn: () => getUsers({ page: 1, page_size: ALL }),
    enabled: isAuthenticated,
  });
}
