import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { changeMyPassword } from '@/api/me';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';

export interface ChangePasswordForm {
  current: string;
  next: string;
  confirm: string;
}

const EMPTY: ChangePasswordForm = { current: '', next: '', confirm: '' };

/**
 * Self-service password change (`PUT /me/password`).
 *
 * Any operator can do this for themselves — it does not go through
 * `updateUser()`, which needs `system: Edit`. The confirm field and the
 * "different from the current one" rule are client-side only; the backend
 * checks `current_password` and is the real gate.
 *
 * The backend revokes the session on success (verified: the old access AND
 * refresh tokens both 401 straight after), so this clears auth and the root
 * route bounces to the login form. Leaving the session up would instead
 * surface as a mystery "session expired" on the next request.
 */
export function useChangePassword(onDone?: () => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [form, setForm] = useState<ChangePasswordForm>(EMPTY);
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      changeMyPassword({ current_password: form.current, new_password: form.next }),
    onSuccess: () => {
      setForm(EMPTY);
      setValidationError(null);
      toast.success(t('Password changed — sign in again with your new password.'));
      onDone?.();
      clearAuth();
    },
    onError: (err) => toast.apiError(err),
  });

  const setField = <K extends keyof ChangePasswordForm>(key: K, value: ChangePasswordForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setValidationError(null);
  };

  const reset = () => {
    setForm(EMPTY);
    setValidationError(null);
    mutation.reset();
  };

  /** Returns the first problem with the form, or null when it is submittable. */
  const validate = (): string | null => {
    if (!form.current) return t('Enter your current password.');
    if (!form.next) return t('Enter a new password.');
    if (form.next !== form.confirm) return t('The new passwords do not match.');
    if (form.next === form.current) return t('The new password matches the current one.');
    return null;
  };

  const submit = () => {
    const problem = validate();
    if (problem) {
      setValidationError(problem);
      return;
    }
    mutation.mutate();
  };

  return {
    form,
    setField,
    submit,
    reset,
    /** Client-side complaint, shown before anything is sent. */
    validationError,
    /** Server-side complaint (wrong current password, policy rejection). */
    submitError: mutation.error?.message ?? null,
    isSaving: mutation.isPending,
    canSubmit: validate() === null && !mutation.isPending,
  };
}
