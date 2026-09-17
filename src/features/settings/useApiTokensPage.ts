import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getUsers, updateUser } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { useZmConfig } from '@/features/config/useZmConfig';
import type { User } from '@/types';

/** One request covers any real install; the API caps `page_size` at 1000. */
const ALL_USERS_PAGE_SIZE = 1000;

export interface ApiTokensRow {
  user: User;
  /** Draft state of the API Enabled checkbox. */
  apiEnabled: boolean;
  /** Draft state of the Revoke Token checkbox (cleared after Update). */
  revoke: boolean;
  /** True while the draft differs from what the backend holds. */
  dirty: boolean;
}

/**
 * Options → API, legacy `_options_api.php`.
 *
 * The legacy form is three columns — Username, Revoke Token, API Enabled —
 * and two verbs. **Update** writes the API Enabled column back (legacy does
 * it as "turn every row off, then switch the checked ones on") and stamps
 * `TokenMinExpiry = now` on every row whose Revoke Token box is ticked.
 * **Revoke All Tokens** stamps that same floor on every user at once.
 *
 * Both map onto `PUT /users/{id}` (`api_enabled`, `token_min_expiry`), one
 * request per row that actually changes — legacy's blanket `UPDATE Users SET
 * APIEnabled=0` would be a write per user for no reason.
 *
 * Legacy's third button, **New Token**, has no equivalent here: issuing
 * long-lived API tokens was dropped with sessions (MEMORY, 2026-08-21), so
 * the button is not rendered rather than rendered dead.
 */
export function useApiTokensPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { can } = usePerms();
  const queryClient = useQueryClient();
  const toast = useToast();

  const canEdit = can('system', 'Edit');
  /** Legacy refuses to render the tab's form at all when APIs are off. */
  const apiOptionEnabled = useZmConfig('ZM_OPT_USE_API', true);

  const usersQ = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => getUsers({ page: 1, page_size: ALL_USERS_PAGE_SIZE }),
    enabled: isAuthenticated,
  });

  const users = useMemo(
    () => [...(usersQ.data?.items ?? [])].sort((a, b) => a.username.localeCompare(b.username)),
    [usersQ.data],
  );

  /** Draft overrides, keyed by user id; absent means "as the server has it". */
  const [enabledDraft, setEnabledDraft] = useState<Record<number, boolean>>({});
  const [revokeIds, setRevokeIds] = useState<ReadonlySet<number>>(new Set());

  const rows: ApiTokensRow[] = users.map((user) => {
    const stored = user.api_enabled === 1;
    const apiEnabled = enabledDraft[user.id] ?? stored;
    const revoke = revokeIds.has(user.id);
    return { user, apiEnabled, revoke, dirty: apiEnabled !== stored || revoke };
  });
  const dirtyCount = rows.filter((r) => r.dirty).length;

  const setApiEnabled = (id: number, value: boolean) =>
    setEnabledDraft((prev) => ({ ...prev, [id]: value }));
  const toggleRevoke = (id: number) =>
    setRevokeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const resetDraft = () => {
    setEnabledDraft({});
    setRevokeIds(new Set());
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  /** Unix seconds — `TokenMinExpiry` is a second-resolution floor. */
  const now = () => Math.floor(Date.now() / 1000);

  const updateMutation = useMutation({
    mutationFn: async (changed: ApiTokensRow[]) => {
      const stamp = now();
      for (const row of changed) {
        const body: { api_enabled?: number; token_min_expiry?: number } = {};
        if (row.apiEnabled !== (row.user.api_enabled === 1)) {
          body.api_enabled = row.apiEnabled ? 1 : 0;
        }
        if (row.revoke) body.token_min_expiry = stamp;
        await updateUser(row.user.id, body);
      }
      return changed.length;
    },
    onSuccess: (count) => {
      toast.success(t('{{count}} user updated', { count }));
      resetDraft();
    },
    onError: (err) => toast.apiError(err),
    onSettled: invalidate,
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const stamp = now();
      for (const user of users) await updateUser(user.id, { token_min_expiry: stamp });
      return users.length;
    },
    onSuccess: () => {
      toast.success(t('All tokens revoked'));
      setRevokeIds(new Set());
    },
    onError: (err) => toast.apiError(err),
    onSettled: invalidate,
  });

  const [confirmingRevokeAll, setConfirmingRevokeAll] = useState(false);

  return {
    isAuthenticated,
    isLoading: usersQ.isLoading,
    isError: usersQ.isError,
    error: usersQ.error,
    refetch: () => void usersQ.refetch(),

    apiOptionEnabled,
    canEdit,
    rows,
    dirtyCount,
    setApiEnabled,
    toggleRevoke,
    resetDraft,

    save: () => {
      const changed = rows.filter((r) => r.dirty);
      if (changed.length > 0) updateMutation.mutate(changed);
    },
    isSaving: updateMutation.isPending,

    confirmingRevokeAll,
    askRevokeAll: () => setConfirmingRevokeAll(true),
    cancelRevokeAll: () => setConfirmingRevokeAll(false),
    confirmRevokeAll: () => {
      setConfirmingRevokeAll(false);
      revokeAllMutation.mutate();
    },
    isRevokingAll: revokeAllMutation.isPending,
  };
}
