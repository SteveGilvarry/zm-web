import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createControl, updateControl, type Control } from '@/api/controls';
import { useToast } from '@/components/common/toastStore';
import {
  CONTROL_TABS,
  controlToForm,
  emptyControlForm,
  formToPayload,
  type ControlFieldKey,
  type ControlFormValues,
  type ControlTabKey,
} from './controlFields';

/**
 * Form state for one PTZ control profile. `editing === null` creates
 * (`POST /controls`); otherwise PATCHes the row with every field, so an
 * unticked flag is written as 0 rather than left out.
 *
 * Mount it keyed on the profile id so switching rows resets the form.
 */
export function useControlEditor(editing: Control | null, onSaved: (saved: Control) => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const [values, setValues] = useState<ControlFormValues>(() =>
    editing ? controlToForm(editing) : emptyControlForm());
  const [tab, setTab] = useState<ControlTabKey>('main');
  const [dirty, setDirty] = useState(false);

  const setField = (key: ControlFieldKey, value: string | number | null) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  };
  const toggleFlag = (key: ControlFieldKey) => setField(key, values[key] ? 0 : 1);

  const save = useMutation({
    mutationFn: () => {
      const payload = formToPayload(values);
      return editing ? updateControl(editing.id, payload) : createControl(payload);
    },
    onSuccess: (saved) => {
      toast.success(editing ? t('Control profile saved') : t('Control profile created'));
      setDirty(false);
      onSaved(saved);
    },
    onError: (err) => toast.apiError(err),
  });

  const name = typeof values.name === 'string' ? values.name.trim() : '';
  /** Legacy requires a name; the backend requires name + type. */
  const validationError = name ? null : t('Name is required');

  return {
    values,
    setField,
    toggleFlag,
    tab,
    setTab,
    tabs: CONTROL_TABS,
    dirty,
    submit: () => {
      if (validationError) {
        setTab('main');
        return;
      }
      save.mutate();
    },
    isSaving: save.isPending,
    submitDisabled: save.isPending || !!validationError,
    validationError,
  };
}
