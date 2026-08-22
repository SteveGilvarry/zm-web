import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '@/stores/ui';

// Stub the router Link so click handlers still fire (we test onClick dismiss).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, onClick, ...rest }: {
    children: React.ReactNode;
    to?: string;
    onClick?: () => void;
  }) => (
    <a href={to ?? '#'} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

const ACK_KEY = 'zm-web:skinHintDismissed';
const { SkinHint } = await import('./SkinHint');

beforeEach(() => {
  window.localStorage.clear();
  // Reset to modern skin between tests (the default).
  useUiStore.setState({ skin: 'modern' });
});

describe('SkinHint — visibility', () => {
  it('renders the banner when skin=modern and not previously dismissed', () => {
    render(<SkinHint />);
    expect(screen.getByText(/coming from the legacy ui/i)).toBeInTheDocument();
  });

  it('renders nothing when skin=classic (operator already on legacy)', () => {
    useUiStore.setState({ skin: 'classic' });
    const { container } = render(<SkinHint />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when localStorage flag is already set', () => {
    window.localStorage.setItem(ACK_KEY, String(Date.now()));
    const { container } = render(<SkinHint />);
    expect(container.firstChild).toBeNull();
  });
});

describe('SkinHint — dismiss', () => {
  it('hides the banner and writes the ack key when the X button is clicked', async () => {
    const user = userEvent.setup();
    render(<SkinHint />);

    expect(screen.getByText(/coming from the legacy ui/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/coming from the legacy ui/i)).toBeNull();
    expect(window.localStorage.getItem(ACK_KEY)).not.toBeNull();
  });

  it('also dismisses + writes the ack key when the Settings link is followed', async () => {
    const user = userEvent.setup();
    render(<SkinHint />);

    await user.click(screen.getByRole('link', { name: /settings → appearance/i }));

    expect(screen.queryByText(/coming from the legacy ui/i)).toBeNull();
    expect(window.localStorage.getItem(ACK_KEY)).not.toBeNull();
  });

  it('swallows localStorage write errors so dismissal still hides the banner', async () => {
    const user = userEvent.setup();
    // Simulate a private-window context where setItem throws.
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceededError'); });

    render(<SkinHint />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/coming from the legacy ui/i)).toBeNull();
    setItemSpy.mockRestore();
  });
});
