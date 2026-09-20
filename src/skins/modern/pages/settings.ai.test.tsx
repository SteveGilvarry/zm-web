/**
 * Settings → AI (modern skin): the section tabs, the three tables, and the
 * editor writing through the same hook the classic page uses.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/render';
import { setupMockServer, db } from '@/test/msw/server';
import { makeAiModel } from '@/test/fixtures';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { AiSection } from '@/skins/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

setupMockServer();

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};

function signIn() {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
    user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT } as never,
  });
  useToastStore.getState().clear();
}

async function mount(section: AiSection) {
  const { default: Page } = await import('./settings.ai');
  return renderWithProviders(<Page section={section} />);
}

describe('SettingsAiPage (modern)', () => {
  it('marks the current section in the tab strip and links to the others', async () => {
    signIn();
    await mount('models');

    const nav = screen.getByRole('navigation', { name: 'AI' });
    expect(within(nav).getByRole('link', { name: 'Models' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Datasets' })).toHaveAttribute('href', '/settings/ai/datasets');
    expect(within(nav).getByRole('link', { name: 'Object Classes' })).toHaveAttribute('href', '/settings/ai/classes');
  });

  it('lists models with their dataset and enabled state', async () => {
    signIn();
    db.aiModels = [makeAiModel({ id: 7, name: 'yolo11n', enabled: 0 })];
    await mount('models');

    const row = (await screen.findByRole('button', { name: 'yolo11n' })).closest('tr')!;
    expect(within(row).getByText('COCO')).toBeInTheDocument();
    expect(within(row).getByText('No')).toBeInTheDocument();
  });

  it('opens the editor from a row and saves the change', async () => {
    signIn();
    await mount('datasets');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'COCO' }));
    const dialog = await screen.findByRole('dialog');
    const version = within(dialog).getByLabelText('Version');
    await user.clear(version);
    await user.type(version, '2018');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(db.aiDatasets[0].version).toBe('2018'));
  });
});
