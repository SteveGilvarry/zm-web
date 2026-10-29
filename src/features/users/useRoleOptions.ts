import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAllRoles } from '@/features/roles/queries';
import type { SelectOption } from './useAccountForm';

/**
 * The user editor's Role select (`user.php:154-160`): legacy's "NoRole"
 * first, then every role by name. A stored id the list does not know is
 * kept as its own option so saving never drops it silently.
 */
export function useRoleOptions(current: string): SelectOption[] {
  const { t } = useTranslation();
  const { data } = useAllRoles();
  return useMemo(() => {
    const options: SelectOption[] = [
      { value: '', label: t('No Role (Direct Permissions Only)') },
      ...(data ?? []).map((r) => ({ value: String(r.id), label: r.name })),
    ];
    if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: `#${current}` });
    return options;
  }, [data, current, t]);
}
