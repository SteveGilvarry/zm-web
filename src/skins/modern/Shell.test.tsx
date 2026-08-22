import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

let pathname = '/';
vi.mock('@tanstack/react-router', () => ({
  useRouterState: (opts?: { select?: (s: { location: { pathname: string } }) => unknown }) => {
    const state = { location: { pathname } };
    return opts?.select ? opts.select(state) : state;
  },
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));
vi.mock('@/components/layout/Header', () => ({
  Header: ({ onMenu, menuOpen }: { onMenu?: () => void; menuOpen?: boolean }) => (
    <button type="button" onClick={onMenu} aria-expanded={menuOpen} aria-label="Open menu">menu</button>
  ),
}));
vi.mock('@/components/common/BackendBanner', () => ({ BackendBanner: () => null }));

const { ModernShell } = await import('./Shell');

/** Drive `matchMedia` so the sidebar believes it is below `lg`. */
function setViewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('min-width: 1024px') ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: { user: 'admin' } as never, isAuthenticated: true });
});
afterAll(() => useAuthStore.getState().clearAuth());

describe('ModernShell — mobile drawer', () => {
  it('opens from the header button, moves focus in, closes on Escape and restores focus', async () => {
    setViewport(false);
    const user = userEvent.setup();
    renderWithProviders(<ModernShell title="Console"><p>body</p></ModernShell>);
    const aside = screen.getByRole('complementary', { hidden: true });
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    const menu = screen.getByRole('button', { name: 'Open menu' });
    menu.focus();
    await user.click(menu);
    expect(aside).not.toHaveAttribute('aria-hidden');
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    const close = screen.getByRole('button', { name: /close menu/i });
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    expect(menu).toHaveFocus();
  });

  it('closes when the route changes', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<ModernShell title="Console"><p>body</p></ModernShell>);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('complementary')).not.toHaveAttribute('aria-hidden');
    pathname = '/events';
    act(() => rerender(<ModernShell title="Events"><p>body</p></ModernShell>));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
    pathname = '/';
  });

  it('is always present on desktop and the collapse toggle is back', () => {
    setViewport(true);
    renderWithProviders(<ModernShell title="Console"><p>body</p></ModernShell>);
    expect(screen.getByRole('complementary')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
  });
});
