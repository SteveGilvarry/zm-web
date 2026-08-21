/**
 * The toolbar dropdown (Columns ▦ / Export ⇩): trigger state through
 * aria-expanded, and the three ways the menu closes.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ClassicDropdown, classicMenuItemClass } from './Dropdown';

function mount(align?: 'start' | 'end') {
  return renderWithProviders(
    <div>
      <button type="button">outside</button>
      <ClassicDropdown label="Columns" icon={<svg data-testid="icon" />} align={align} className="ms-2">
        <button type="button" role="menuitem" className={classicMenuItemClass}>Reset columns</button>
      </ClassicDropdown>
    </div>,
  );
}

describe('ClassicDropdown', () => {
  it('starts closed with the trigger announcing a collapsed menu', () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Columns' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click and points aria-controls at the menu it revealed', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Columns' });
    await userEvent.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Columns' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(within(menu).getByRole('menuitem', { name: 'Reset columns' })).toBeInTheDocument();
  });

  it('toggles shut on a second trigger click', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Columns' });
    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when the pointer goes down outside it', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open for a click inside the menu', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reset columns' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on Escape and ignores other keys', async () => {
    mount('start');
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('detaches its document listeners on unmount', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    unmount();
    const events = remove.mock.calls.map((c) => c[0]);
    expect(events).toContain('mousedown');
    expect(events).toContain('keydown');
    remove.mockRestore();
  });
});
