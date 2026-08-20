import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ when }: { when: boolean }) {
  if (when) throw new Error('kaboom');
  return <p>fine</p>;
}

describe('ErrorBoundary', () => {
  it('renders the fallback with the error and resets', () => {
    const onError = vi.fn();
    const fallback = (err: Error, reset: () => void) => (
      <button onClick={reset}>{err.message}</button>
    );
    const { rerender } = render(
      <ErrorBoundary onError={onError} fallback={fallback}>
        <Boom when />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'kaboom' })).toBeInTheDocument();
    // The boundary holds the error until reset, even when children change.
    rerender(
      <ErrorBoundary onError={onError} fallback={fallback}>
        <Boom when={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByText('fine')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'kaboom' }));
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('resets when resetKeys change', () => {
    const { rerender } = render(
      <ErrorBoundary fallback={<p>fallback</p>} resetKeys={['/a']} onError={() => undefined}>
        <Boom when />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fallback')).toBeInTheDocument();
    rerender(
      <ErrorBoundary fallback={<p>fallback</p>} resetKeys={['/b']} onError={() => undefined}>
        <Boom when={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
