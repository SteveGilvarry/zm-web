import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { answerPrivacyStatement } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { useZmConfig, useZmConfigTable } from '@/features/config/useZmConfig';

/**
 * Legacy's privacy statement (`privacy.php`). `index.php:274` sends a
 * System Edit user to it on every page while `ZM_SHOW_PRIVACY` is on; the
 * answer (`actions/privacy.php`) sets `ZM_TELEMETRY_DATA` and turns
 * `ZM_SHOW_PRIVACY` off, so it is asked once. zm-api#189 does the same.
 */
export function usePrivacyStatement(options: { onAnswered?: () => void } = {}) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = usePerms();
  const toast = useToast();
  const queryClient = useQueryClient();
  const table = useZmConfigTable();
  const showPrivacy = useZmConfig('ZM_SHOW_PRIVACY', false);
  const telemetry = useZmConfig('ZM_TELEMETRY_DATA', false);
  const canAnswer = can('system', 'Edit');

  const mutation = useMutation({
    mutationFn: (accept: boolean) => answerPrivacyStatement(accept),
    onSuccess: (res, accept) => {
      // Hide the statement now rather than after the config table refetches.
      queryClient.setQueryData<Record<string, string>>(['configs', 'lookup'], (old) =>
        old
          ? {
            ...old,
            ZM_SHOW_PRIVACY: res.show_privacy ? '1' : '0',
            ZM_TELEMETRY_DATA: (res.telemetry ?? accept) ? '1' : '0',
          }
          : old);
      void queryClient.invalidateQueries({ queryKey: ['configs'] });
      toast.success(accept ? t('Thank you. Telemetry is on.') : t('Telemetry is off.'));
      options.onAnswered?.();
    },
    onError: (e) => toast.apiError(e),
  });

  return {
    /** Ask now: signed in, the flag is on, and this user may answer. */
    mustAnswer: isAuthenticated && table.isSuccess && showPrivacy && canAnswer,
    canAnswer,
    /** Legacy's select starts on the current `ZM_TELEMETRY_DATA`. */
    telemetry,
    answer: (accept: boolean) => mutation.mutate(accept),
    isSaving: mutation.isPending,
  };
}
