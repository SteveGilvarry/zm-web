import { create } from 'zustand';
import { useMemo } from 'react';
import { apiErrorMessage } from '@/api/client';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** ms before auto-dismiss; 0 keeps it until closed. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

const DEFAULT_DURATION: Record<ToastTone, number> = { info: 4000, success: 4000, error: 8000 };
const MAX_VISIBLE = 4;
let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export interface ToastApi {
  toast: (message: string, tone?: ToastTone, duration?: number) => number;
  info: (message: string) => number;
  success: (message: string) => number;
  error: (message: string) => number;
  /** `onError: (err) => toast.apiError(err)` — message from the API envelope. */
  apiError: (error: unknown) => number;
  dismiss: (id: number) => void;
}

/** Imperative toast API for use outside React (mutation callbacks, stores). */
export const toast: ToastApi = {
  toast: (message, tone = 'info', duration = DEFAULT_DURATION[tone]) =>
    useToastStore.getState().push({ message, tone, duration }),
  info: (message) => toast.toast(message, 'info'),
  success: (message) => toast.toast(message, 'success'),
  error: (message) => toast.toast(message, 'error'),
  apiError: (error) => toast.toast(apiErrorMessage(error), 'error'),
  dismiss: (id) => useToastStore.getState().dismiss(id),
};

/**
 * Toasts for components.
 *
 *   const toast = useToast();
 *   useMutation({ mutationFn, onError: toast.apiError, onSuccess: () => toast.success(t('Saved')) });
 *
 * Returns a stable object, so it is safe in dependency arrays.
 */
export function useToast(): ToastApi {
  return useMemo(() => toast, []);
}
