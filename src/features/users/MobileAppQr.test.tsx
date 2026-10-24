import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { MobileAppQr } from './MobileAppQr';

// The SVG carries the text it encoded, so the test reads the payload back
// from the image instead of decoding a QR.
vi.mock('qrcode', () => ({
  toString: vi.fn(async (text: string) => `<svg data-text="${text.replace(/"/g, '&quot;')}"></svg>`),
}));

vi.mock('@/features/config/useZmConfig', () => ({
  useZmConfig: (name: string, fallback: unknown) => (name === 'ZM_WEB_TITLE' ? 'Back Yard' : fallback),
}));

function payloadOf(img: HTMLImageElement): Record<string, string> {
  const svg = decodeURIComponent(img.src.replace('data:image/svg+xml;utf8,', ''));
  const text = /data-text="([^"]*)"/.exec(svg)![1].replace(/&quot;/g, '"');
  return JSON.parse(text);
}

function setup() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MobileAppQr username="steve" />
    </QueryClientProvider>,
  );
}

describe('MobileAppQr', () => {
  it('renders the profile QR for the user, named after ZM_WEB_TITLE, without a password', async () => {
    setup();
    const img = await screen.findByRole('img', { name: /scan this qr code with the zmng app/i });
    expect(payloadOf(img as HTMLImageElement)).toEqual({
      n: 'Back Yard',
      p: window.location.origin,
      u: 'steve',
    });
    expect(screen.getByText('zmNg Mobile App QR Code')).toBeInTheDocument();
  });

  it('adds the password to the QR as it is typed, and can show it', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('img');
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await user.type(field, 'hunter2');
    await waitFor(() => {
      expect(payloadOf(screen.getByRole('img') as HTMLImageElement).pw).toBe('hunter2');
    });
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(field).toHaveAttribute('type', 'text');
  });
});
