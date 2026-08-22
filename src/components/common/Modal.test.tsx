/**
 * Modal is the app's only focus trap, so the interesting behaviour is all
 * keyboard: where focus lands on open, that Tab cannot leave the dialog, that
 * Escape and the overlay close it, and that focus goes back where it came from.
 */
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, type Mock } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { Modal } from './Modal';

// The trap filters candidates by `offsetParent !== null` to skip hidden
// controls. jsdom does no layout, so offsetParent is always null and every
// control would look hidden. Report a parent for anything actually in the
// document, which is the browser behaviour the filter was written against.
let restoreOffsetParent: (() => void) | undefined;
beforeAll(() => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) { return this.isConnected ? document.body : null; },
  });
  restoreOffsetParent = () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetParent;
  };
});
afterAll(() => { restoreOffsetParent?.(); });

function Fields() {
  return (
    <>
      <input aria-label="Name" />
      <input aria-label="Host" />
      <button type="button">Save</button>
    </>
  );
}

let onClose: Mock<() => void>;
beforeEach(() => { onClose = vi.fn<() => void>(); });

function open(children: React.ReactNode = <Fields />, title = 'Add monitor') {
  return renderWithProviders(
    <Modal isOpen onClose={onClose} title={title}>{children}</Modal>,
  );
}

describe('Modal — rendering', () => {
  it('renders nothing while closed', () => {
    renderWithProviders(
      <Modal isOpen={false} onClose={onClose} title="Add monitor"><Fields /></Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog labelled by its own title', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Add monitor');
    expect(screen.getByRole('heading', { name: 'Add monitor' })).toBeInTheDocument();
  });
});

describe('Modal — focus management', () => {
  it('moves focus to the first field, not the close button', () => {
    open();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('focuses the panel itself when there is nothing focusable inside', () => {
    open(<p>Nothing to do here.</p>);
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('restores focus to the previously focused element on close', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <>
        <button type="button">Opener</button>
        <Modal isOpen={false} onClose={onClose} title="Add monitor"><Fields /></Modal>
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Opener' });
    await user.click(opener);
    expect(opener).toHaveFocus();

    rerender(
      <>
        <button type="button">Opener</button>
        <Modal isOpen onClose={onClose} title="Add monitor"><Fields /></Modal>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();

    rerender(
      <>
        <button type="button">Opener</button>
        <Modal isOpen={false} onClose={onClose} title="Add monitor"><Fields /></Modal>
      </>,
    );
    expect(opener).toHaveFocus();
  });
});

describe('Modal — the Tab trap', () => {
  // DOM order inside the panel is [Close, Name, Host, Save].
  it('wraps forward from the last control back to the first', async () => {
    const user = userEvent.setup();
    open();
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('wraps backward from the first control to the last', async () => {
    const user = userEvent.setup();
    open();
    screen.getByRole('button', { name: 'Close' }).focus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  });

  it('wraps backward from the panel itself to the last control', async () => {
    const user = userEvent.setup();
    open();
    screen.getByRole('dialog').focus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  });

  it('tabs from the panel into the dialog when it holds only the close button', async () => {
    const user = userEvent.setup();
    open(<p>Read only.</p>);
    expect(screen.getByRole('dialog')).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('leaves ordinary typing alone', async () => {
    const user = userEvent.setup();
    open();
    await user.keyboard('front door');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('front door');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Modal — dismissal', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    open();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the close button is pressed', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click on the overlay but not on the panel', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    const overlay = screen.getByRole('dialog').parentElement!;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls the latest onClose after the prop changes mid-open', async () => {
    const user = userEvent.setup();
    const second = vi.fn<() => void>();
    const { rerender } = open();
    rerender(<Modal isOpen onClose={second} title="Add monitor"><Fields /></Modal>);

    await user.keyboard('{Escape}');
    expect(second).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops listening for Escape once closed', async () => {
    const user = userEvent.setup();
    const { rerender } = open();
    rerender(<Modal isOpen={false} onClose={onClose} title="Add monitor"><Fields /></Modal>);

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
