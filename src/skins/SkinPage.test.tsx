/**
 * `SkinPage` is the indirection every route goes through: it asks the active
 * skin for a page, borrows the fallback skin's page when the active one has
 * none — visibly, via `data-skin-fallback` plus a one-time dev warning — and
 * refuses to render a key no skin implements.
 *
 * The registry is mocked with a two-skin stand-in so a "missing page" can be
 * arranged without touching the real skins (`registry.test.ts` owns the real
 * `resolvePage` contract and the coverage allow-list).
 */
import { Component, createElement, type ComponentType, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { PageKey, SkinId } from './types';

const active = vi.hoisted(() => ({ id: 'modern' as SkinId }));

vi.mock('./registry', async () => {
  const { lazy } = await import('react');
  const page = (label: string) =>
    lazy(async () => ({
      default: ({ monitorId }: { monitorId?: number }) => (
        <p>{monitorId === undefined ? label : `${label} #${monitorId}`}</p>
      ),
    }));

  const testSkins = {
    modern: {
      id: 'modern',
      pages: {
        console: page('modern console'),
        cycle: page('modern cycle'),
        'monitors.watch': page('modern watch'),
      },
    },
    classic: {
      id: 'classic',
      // Deliberately sparse: everything else falls back to modern.
      pages: { console: page('classic console') },
    },
  } as const;

  type Skin = { id: SkinId; pages: Record<string, unknown> };
  return {
    skinIds: ['modern', 'classic'],
    fallbackSkinId: 'modern',
    useSkin: () => testSkins[active.id],
    resolvePage: (skin: Skin, key: string) => {
      const own = skin.pages[key];
      if (own) return { Page: own, ownPage: true, from: skin.id };
      return { Page: testSkins.modern.pages[key as never], ownPage: false, from: 'modern' };
    },
  };
});

const { SkinPage } = await import('./SkinPage');

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p role="alert">{this.state.error.message}</p> : this.props.children;
  }
}

/** `page` is typed against the real PageKey union; the mock's keys are a subset. */
const show = (key: string, props: Record<string, unknown> = {}) =>
  render(
    createElement(SkinPage as unknown as ComponentType<Record<string, unknown>>, {
      page: key,
      ...props,
    }),
  );

beforeEach(() => {
  active.id = 'modern';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('SkinPage — the skin has its own page', () => {
  it('renders it unwrapped', async () => {
    const { container } = show('console');
    expect(await screen.findByText('modern console')).toBeInTheDocument();
    expect(container.querySelector('[data-skin-fallback]')).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('picks the active skin, not the fallback', async () => {
    active.id = 'classic';
    show('console');
    expect(await screen.findByText('classic console')).toBeInTheDocument();
    expect(screen.queryByText('modern console')).not.toBeInTheDocument();
  });

  it('passes the route params through to the page', async () => {
    show('monitors.watch', { monitorId: 7 });
    expect(await screen.findByText('modern watch #7')).toBeInTheDocument();
  });
});

describe('SkinPage — the skin borrows a page', () => {
  it('renders the fallback page inside a tagged wrapper and warns once', async () => {
    active.id = 'classic';
    const { container } = show('monitors.watch');

    expect(await screen.findByText('modern watch')).toBeInTheDocument();
    const wrapper = container.querySelector('[data-skin-fallback]');
    expect(wrapper).toHaveAttribute('data-skin-fallback', 'modern');
    expect(wrapper).toContainElement(screen.getByText('modern watch'));

    await waitFor(() => expect(console.warn).toHaveBeenCalledOnce());
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain(
      '[skins] "classic" has no page "monitors.watch"; rendering the "modern" page instead.',
    );
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain(
      'src/skins/classic/pages/monitors.watch.tsx',
    );
  });

  it('does not warn again for the same skin + page', async () => {
    active.id = 'classic';
    const { unmount } = show('monitors.watch');
    expect(await screen.findByText('modern watch')).toBeInTheDocument();
    unmount();
    show('monitors.watch');
    expect(await screen.findByText('modern watch')).toBeInTheDocument();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns separately for each borrowed page', async () => {
    active.id = 'classic';
    show('cycle');
    expect(await screen.findByText('modern cycle')).toBeInTheDocument();
    await waitFor(() => expect(console.warn).toHaveBeenCalledOnce());
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain('no page "cycle"');
  });
});

describe('SkinPage — nobody implements the page', () => {
  it('throws rather than rendering a blank route', () => {
    active.id = 'classic';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Boundary>
        <SkinPage page={'audit' as PageKey} />
      </Boundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No skin implements page "audit" (active skin: classic)',
    );
  });
});
