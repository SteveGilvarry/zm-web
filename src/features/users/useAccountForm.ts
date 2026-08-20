import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { createUser, updateUser } from '@/api/users';
import type { User } from '@/types';

export interface AccountFormData {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
  email: string;
  phone: string;
  enabled: number;
}

/**
 * Form state + create/update mutation for the user editor's Account tab.
 * `editing === null` means "create"; otherwise username is fixed and a
 * blank password keeps the current one.
 */
export function useAccountForm(editing: User | null, onSaved: () => void) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<AccountFormData>({
    username: editing?.username || '',
    password: '',
    confirmPassword: '',
    name: editing?.name || '',
    email: editing?.email || '',
    phone: editing?.phone || '',
    enabled: editing?.enabled ?? 1,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, data),
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const setField = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) =>
    setFormData((f) => ({ ...f, [key]: value }));

  const toggleEnabled = () =>
    setFormData((f) => ({ ...f, enabled: f.enabled === 1 ? 0 : 1 }));

  const submit = () => {
    setError(null);
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError(t('Passwords do not match.'));
      return;
    }
    if (editing) {
      const data: Parameters<typeof updateUser>[1] = {
        name: formData.name,
        email: formData.email,
        enabled: formData.enabled,
        phone: formData.phone,
      };
      if (formData.password) data.password = formData.password;
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        enabled: formData.enabled,
        phone: formData.phone || undefined,
      });
    }
  };

  const submitDisabled = isSaving || !formData.username || (!editing && !formData.password);

  return { formData, setField, toggleEnabled, error, isSaving, submitDisabled, submit };
}
