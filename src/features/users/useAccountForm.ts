import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { createUser, updateUser } from '@/api/users';
import { useToast } from '@/components/common/toastStore';
import { LANGUAGES } from '@/i18n/languages';
import type { User } from '@/types';

/** Legacy `user.php` input pattern for Username. */
export const USERNAME_PATTERN = /^[A-Za-z0-9 .@]+$/;
export const USERNAME_PATTERN_SOURCE = '[A-Za-z0-9 .@]+';

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** Legacy `user.php` `$homeview_options`, in its order. */
export const HOME_VIEWS = ['console', 'events', 'map', 'montage', 'montagereview', 'watch'] as const;
export type HomeView = (typeof HOME_VIEWS)[number];

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The Language picker: ZoneMinder stores the `web/lang/<file>` name, so the
 * values are `zmFile`s from the app's own language list. '' is the site
 * default (legacy's blank option). A stored value the list does not know
 * is kept as its own option rather than silently rewritten.
 */
export function languageOptions(current: string | null | undefined, defaultLabel: string): SelectOption[] {
  const known = LANGUAGES.filter((l) => l.zmFile).map((l) => ({ value: l.zmFile as string, label: l.nativeName }));
  const options = [{ value: '', label: defaultLabel }, ...known];
  if (current && !known.some((o) => o.value === current)) options.push({ value: current, label: current });
  return options;
}

export interface AccountFormData {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
  email: string;
  phone: string;
  enabled: number;
  /** ZoneMinder language file name, '' for the site default. */
  language: string;
  homeView: string;
  apiEnabled: number;
}

/** What an admin may edit on any account. Self-edit (below) is a subset. */
export type AccountField = Exclude<keyof AccountFormData, 'confirmPassword'>;

/** `ZM_USER_SELF_EDIT` (legacy `actions/user.php`): password, language, home view only. */
const SELF_EDIT_FIELDS: ReadonlySet<AccountField> = new Set(['password', 'language', 'homeView']);

export interface AccountFormOptions {
  /**
   * Self-edit: the signed-in user editing their own row without System
   * Edit. Legacy saves password, language and home view and nothing else.
   */
  selfEdit?: boolean;
}

type UpdatePayload = Parameters<typeof updateUser>[1];

/**
 * The fields that differ from the stored row, as an `UpdateUserRequest`.
 * A blank password means "leave it"; self-edit drops everything legacy
 * would not save.
 */
export function editPatch(editing: User, form: AccountFormData, selfEdit: boolean): UpdatePayload {
  const patch: UpdatePayload = {};
  if (form.password) patch.password = form.password;
  if ((editing.language ?? '') !== form.language) patch.language = form.language || null;
  if ((editing.home_view || 'console') !== form.homeView) patch.home_view = form.homeView;
  if (selfEdit) return patch;
  if (editing.name !== form.name) patch.name = form.name;
  if (editing.email !== form.email) patch.email = form.email;
  if ((editing.phone ?? '') !== form.phone) patch.phone = form.phone;
  if (editing.enabled !== form.enabled) patch.enabled = form.enabled;
  if ((editing.api_enabled ?? 1) !== form.apiEnabled) patch.api_enabled = form.apiEnabled;
  return patch;
}

/**
 * Form state + create/update mutation for the user editor's Account tab.
 * `editing === null` means "create"; otherwise username is fixed and only
 * the fields that changed are sent (`editPatch`).
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
    language: editing?.language ?? '',
    homeView: editing?.home_view || 'console',
    apiEnabled: editing?.api_enabled ?? 1,
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
    mutationFn: ({ id, data }: { id: number; data: UpdatePayload }) => updateUser(id, data),
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
  const toggleApiEnabled = () =>
    setFormData((f) => ({ ...f, apiEnabled: f.apiEnabled === 1 ? 0 : 1 }));

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
      const patch = editPatch(editing, formData, selfEdit);
      if (Object.keys(patch).length === 0) {
        onSaved();
        return;
      }
      updateMutation.mutate({ id: editing.id, data: patch });
    } else {
      createMutation.mutate({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        enabled: formData.enabled,
        phone: formData.phone || undefined,
        language: formData.language || undefined,
        home_view: formData.homeView,
        api_enabled: formData.apiEnabled,
      });
    }
  };

  const submitDisabled =
    isSaving || !formData.username || !!usernameError || (!editing && !formData.password);

  /** Whether this form may change `field` — the username is fixed once created. */
  const canChange = (field: AccountField) =>
    field === 'username' ? editing === null : !selfEdit || SELF_EDIT_FIELDS.has(field);

  return {
    formData, setField, toggleEnabled, toggleApiEnabled, error, usernameError, isSaving, submitDisabled, submit,
    canChange, selfEdit,
    languages: languageOptions(editing?.language, t('Default')),
    homeViews: HOME_VIEWS,
  };
}
