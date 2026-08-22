import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/api/client';
import { toast, useToastStore } from './toastStore';
import { ToastViewport } from './ToastViewport';

afterEach(() => {
  useToastStore.getState().clear();
  vi.useRealTimers();
});

describe('toast store + viewport', () => {
  it('renders pushed toasts with the right role and dismisses on click', () => {
    render(<ToastViewport />);
    act(() => {
      toast.success('Saved');
      toast.error('Nope');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Nope');
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByText('Nope')).toBeInTheDocument();
  });

  it('auto-dismisses after the tone duration', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => {
      toast.info('Hello');
    });
    expect(screen.getByText('Hello')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('apiError uses the API envelope message and keeps at most four', () => {
    act(() => {
      toast.apiError(new ApiClientError('Storage in use', 409));
      toast.apiError(new ApiClientError('x', 403));
    });
    const msgs = useToastStore.getState().toasts.map((t) => t.message);
    expect(msgs).toEqual(['Storage in use', 'You do not have permission to do this.']);
    act(() => {
      for (let i = 0; i < 6; i++) toast.info(`t${i}`);
    });
    expect(useToastStore.getState().toasts).toHaveLength(4);
  });
});
