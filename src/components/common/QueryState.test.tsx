import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/api/client';
import { QueryState } from './QueryState';

describe('QueryState', () => {
  it('shows a loading status', () => {
    render(<QueryState isLoading>child</QueryState>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('child')).toBeNull();
  });

  it('renders a no-permission state for 403 without a retry button', () => {
    const onRetry = vi.fn();
    render(
      <QueryState isLoading={false} isError error={new ApiClientError('nope', 403)} onRetry={onRetry}>
        child
      </QueryState>,
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'forbidden');
    expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders an unreachable alert with retry for network / 5xx', () => {
    const onRetry = vi.fn();
    render(
      <QueryState isLoading={false} isError error={new ApiClientError('x', 0)} onRetry={onRetry}>
        child
      </QueryState>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-state', 'unreachable');
    expect(alert).toHaveTextContent('Cannot reach the server.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the API message for other errors', () => {
    render(
      <QueryState isLoading={false} isError error={new ApiClientError('Bad sort field', 400)}>
        child
      </QueryState>,
    );
    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'error');
    expect(screen.getByText('Bad sort field')).toBeInTheDocument();
  });

  it('renders the empty state, then children', () => {
    const { rerender } = render(
      <QueryState isLoading={false} empty emptyMessage="No events found" emptyAction={<button>Add</button>}>
        child
      </QueryState>,
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'empty');
    expect(screen.getByText('No events found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    rerender(<QueryState isLoading={false}>child</QueryState>);
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
