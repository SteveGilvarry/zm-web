/**
 * `AppShell` + `useSkinRootClass`: the chrome around every page, and the two
 * things on `<html>` the token layer in `index.css` switches on — exactly one
 * `skin-*` class and a `data-theme` that only appears when the operator has
 * pinned light or dark.
 *
 * The registry is mocked with two trivial skins so the assertions are about
 * the plumbing, not about the real shells (which have their own tests).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useUiStore } from '@/stores/ui';

vi.mock('./registry', async () => {
  const { useUiStore: store } = await import('@/stores/ui');
  const shell = (id: string) =>
    function Shell({ title, children }: { title?: string; children: ReactNode }) {
      return (
        <div data-testid={`${id}-shell`}>
          <h1>{title ?? 'untitled'}</h1>
          {children}
        </div>
      );
    };
  const testSkins = {
    modern: { id: 'modern', rootClass: 'skin-modern', Shell: shell('modern') },
    classic: { id: 'classic', rootClass: 'skin-classic', Shell: shell('classic') },
  };
  return {
    skinIds: ['modern', 'classic'],
    useSkin: () => testSkins[store((s) => s.skin)],
  };
});

const { AppShell } = await import('./AppShell');

const root = () => document.documentElement;
const skinClasses = () => [...root().classList].filter((c) => c.startsWith('skin-'));

beforeEach(() => {
  root().className = '';
  delete root().dataset.skin;
  delete root().dataset.theme;
  useUiStore.setState({ skin: 'modern', theme: 'system' });
});

describe('AppShell', () => {
  it('wraps the children in the active skin’s shell and hands it the title', () => {
    render(<AppShell title="Console"><p>page body</p></AppShell>);
    const shell = screen.getByTestId('modern-shell');
    expect(shell).toContainElement(screen.getByText('page body'));
    expect(screen.getByRole('heading', { name: 'Console' })).toBeInTheDocument();
    expect(screen.queryByTestId('classic-shell')).not.toBeInTheDocument();
  });

  it('renders the other skin’s shell when that skin is active', () => {
    useUiStore.setState({ skin: 'classic' });
    render(<AppShell title="Console"><p>page body</p></AppShell>);
    expect(screen.getByTestId('classic-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('modern-shell')).not.toBeInTheDocument();
  });

  it('works without a title', () => {
    render(<AppShell><p>page body</p></AppShell>);
    expect(screen.getByRole('heading', { name: 'untitled' })).toBeInTheDocument();
  });
});

describe('useSkinRootClass — skin binding', () => {
  it('puts exactly one skin class and a matching data-skin on <html>', () => {
    render(<AppShell><p>body</p></AppShell>);
    expect(skinClasses()).toEqual(['skin-modern']);
    expect(root().dataset.skin).toBe('modern');
  });

  it('clears a stale skin class left by the pre-paint bootstrap', () => {
    root().classList.add('skin-classic');
    render(<AppShell><p>body</p></AppShell>);
    expect(skinClasses()).toEqual(['skin-modern']);
    expect(root().dataset.skin).toBe('modern');
  });

  it('swaps the class on a skin change instead of stacking a second one', () => {
    render(<AppShell><p>body</p></AppShell>);
    expect(skinClasses()).toEqual(['skin-modern']);

    act(() => useUiStore.getState().setSkin('classic'));
    expect(skinClasses()).toEqual(['skin-classic']);
    expect(root().dataset.skin).toBe('classic');
    expect(screen.getByTestId('classic-shell')).toBeInTheDocument();

    act(() => useUiStore.getState().setSkin('modern'));
    expect(skinClasses()).toEqual(['skin-modern']);
    expect(root().dataset.skin).toBe('modern');
  });

  it('leaves unrelated classes on <html> alone', () => {
    root().classList.add('dark-scrollbars');
    render(<AppShell><p>body</p></AppShell>);
    expect(root()).toHaveClass('dark-scrollbars');
    expect(skinClasses()).toEqual(['skin-modern']);
  });
});

describe('useSkinRootClass — theme binding', () => {
  it('leaves data-theme off while the preference is "system"', () => {
    render(<AppShell><p>body</p></AppShell>);
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('pins the chosen scheme and removes it again on "system"', () => {
    render(<AppShell><p>body</p></AppShell>);

    act(() => useUiStore.getState().setTheme('dark'));
    expect(root().dataset.theme).toBe('dark');

    act(() => useUiStore.getState().setTheme('light'));
    expect(root().dataset.theme).toBe('light');

    act(() => useUiStore.getState().setTheme('system'));
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('clears a data-theme the bootstrap set when the preference is "system"', () => {
    root().dataset.theme = 'dark';
    render(<AppShell><p>body</p></AppShell>);
    expect(root().hasAttribute('data-theme')).toBe(false);
  });
});
