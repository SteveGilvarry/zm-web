import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { createUser, updateUser } from '@/api/users';
import { useToast } from '@/components/common/toastStore';
import type { User } from '@/types';

/** zm_api issue tracking the missing `UpdateUserRequest` fields. */
export const USER_FIELDS_ISSUE_URL = 'https://github.com/SteveGilvarry/zm-api/issues/23';

/**
 * Fields `UpdateUserRequest` drops today (it takes `email` + `enabled` only).
 * The editor disables them on edit rather than pretend a save stuck.
 */
export const LOCKED_ON_EDIT = ['password', 'name', 'phone'] as const;
export type LockedOnEdit = (typeof LOCKED_ON_EDIT)[number];

/** Legacy `user.php` input pattern for Username. */
export const USERNAME_PATTERN = /^[A-Za-z0-9 .@]+$/;
export const USERNAME_PATTERN_SOURCE = '[A-Za-z0-9 .@]+';

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export interface AccountFormData {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
  email: string;
  phone: string;
  enabled: number;
}

export interface AccountFormOptions {
  /**
   * Self-edit (`ZM_USER_SELF_EDIT`, user without System Edit on their own
   * row): legacy allows password, language and home view; this backend
   * persists only `email` on update, so that is all the form offers.
   */
  selfEdit?: boolean;
}

/**
 * Form state + create/update mutation for the user editor's Account tab.
 * `editing === null` means "create"; otherwise username is fixed and only
 * the fields the backend persists (`email`, `enabled`) are sent — see
 * `LOCKED_ON_EDIT`.
 */
export function useAccountForm(editing: User | null, onSaved: () => void, options: AccountFormOptions = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const selfEdit = !!options.selfEdit && editing !== null;
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
    onSuccess: () => {
      toast.success(t('User created'));
      onSaved();
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.apiError(e);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, data),
    onSuccess: () => {
      toast.success(t('User saved'));
      onSaved();
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.apiError(e);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const setField = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) =>
    setFormData((f) => ({ ...f, [key]: value }));

  const toggleEnabled = () =>
    setFormData((f) => ({ ...f, enabled: f.enabled === 1 ? 0 : 1 }));

  const usernameError =
    !editing && formData.username && !isValidUsername(formData.username)
      ? t('Username may only contain letters, digits, spaces, dots and @')
      : null;

  const submit = () => {
    setError(null);
    if (usernameError) {
      setError(usernameError);
      return;
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError(t('Passwords do not match.'));
      return;
    }
    if (editing) {
      // Password/name/phone/permissions are dropped by this backend (F-18,
      // zm-api#23); sending them would only make a silent no-op look saved.
      updateMutation.mutate({
        id: editing.id,
        data: selfEdit ? { email: formData.email } : { email: formData.email, enabled: formData.enabled },
      });
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

  const submitDisabled =
    isSaving || !formData.username || !!usernameError || (!editing && !formData.password);

  const isLocked = (field: LockedOnEdit) => editing !== null && LOCKED_ON_EDIT.includes(field);

  return {
    formData, setField, toggleEnabled, error, usernameError, isSaving, submitDisabled, submit, isLocked, selfEdit,
  };
}
