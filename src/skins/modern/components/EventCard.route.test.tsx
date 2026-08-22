/**
 * EventCard — the interaction and branch work `EventCard.test.tsx` does not
 * reach.
 *
 * That file pins the thumbnail rotation transforms and the score columns
 * against a hand-rolled event object. This one drives the controls: the
 * selection checkbox, the download link that must not navigate the row, the
 * broken-thumbnail fallback, the flip orientations and the cause-colour
 * branches — all against the schema-checked `makeEvent` fixture.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/render';
import { makeEvent } from '@/test/fixtures';
import type { ZmEvent } from '@/types';

// EventCard renders TanStack Router's <Link>, which needs a router context a
// plain component test has no reason to build. A stub <a> keeps the href
// assertable without one.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={to && params ? to.replace(/\$\w+/g, (k) => params[k.slice(1)] ?? k) : (to ?? '#')}
      {...rest}
    >
      {children}
    </a>
  ),
}));

const { EventCard } = await import('./EventCard');

function mount(
  overrides: Partial<ZmEvent> = {},
  props: { isSelected?: boolean; onToggleSelected?: () => void; showThumbnail?: boolean } = {},
) {
  const onOuterClick = vi.fn();
  const result = renderWithProviders(
    <div onClick={onOuterClick} data-testid="row-wrapper">
      <EventCard
        event={makeEvent({ id: 101, name: 'Event-101', ...overrides })}
        monitorName="Front Door"
        token="tok-123"
        isSelected={props.isSelected ?? false}
        onToggleSelected={props.onToggleSelected ?? (() => {})}
        showThumbnail={props.showThumbnail}
      />
    </div>,
  );
  return { ...result, onOuterClick };
}

const img = (container: HTMLElement) => container.querySelector('img') as HTMLImageElement;

describe('EventCard — orientation', () => {
  it('leaves the thumbnail untransformed when the event carries no orientation', () => {
    const { container } = mount({ orientation: '' });
    expect(img(container).style.transform).toBe('');
  });

  it('mirrors a horizontally flipped camera', () => {
    const { container } = mount({ orientation: 'FlipHorizontal' });
    expect(img(container).style.transform).toBe('scaleX(-1)');
  });

  it('accepts the backend FLIP_HORI spelling', () => {
    const { container } = mount({ orientation: 'FLIP_HORI' });
    expect(img(container).style.transform).toBe('scaleX(-1)');
  });

  it('mirrors a vertically flipped camera', () => {
    const { container } = mount({ orientation: 'FlipVertical' });
    expect(img(container).style.transform).toBe('scaleY(-1)');
  });

  it('accepts the backend FLIP_VERT spelling', () => {
    const { container } = mount({ orientation: 'FLIP_VERT' });
    expect(img(container).style.transform).toBe('scaleY(-1)');
  });

  it('ignores an orientation it does not know', () => {
    const { container } = mount({ orientation: 'Skewed' });
    expect(img(container).style.transform).toBe('');
  });
});

describe('EventCard — thumbnail', () => {
  it('points the image at the token-signed thumbnail endpoint', () => {
    const { container } = mount();
    expect(img(container)).toHaveAttribute(
      'src',
      '/api/v3/events/101/thumbnail?token=tok-123',
    );
  });

  it('hides a thumbnail the backend cannot render rather than showing a broken image', () => {
    const { container } = mount();
    const thumb = img(container);
    expect(thumb.style.display).toBe('');
    fireEvent.error(thumb);
    expect(thumb.style.display).toBe('none');
  });

  it('drops the image column entirely when ZM_WEB_LIST_THUMBS is off', () => {
    const { container } = mount({}, { showThumbnail: false });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Event-101' })).toBeInTheDocument();
  });

  it('badges the clip length over the thumbnail', () => {
    const { container } = mount({ length: '12.50' });
    expect(within(container).getByText('13s')).toBeInTheDocument();
  });
});

describe('EventCard — cause badge', () => {
  // `alarm_frames: 0` drops the "Alarm" score column, so the Alarm cause
  // has only one place left to match.
  it.each(['Motion', 'Alarm', 'Continuous', 'Forced Web'])(
    'renders the %s cause',
    (cause) => {
      mount({ cause, alarm_frames: 0 });
      expect(screen.getByText(cause)).toBeInTheDocument();
    },
  );
});

describe('EventCard — selection', () => {
  it('calls back when the unselected checkbox is clicked, without bubbling to the row', async () => {
    const onToggleSelected = vi.fn();
    const user = userEvent.setup();
    const { onOuterClick } = mount({}, { onToggleSelected });

    await user.click(screen.getByRole('button', { name: 'Select event' }));

    expect(onToggleSelected).toHaveBeenCalledTimes(1);
    expect(onOuterClick).not.toHaveBeenCalled();
  });

  it('offers to deselect once selected', async () => {
    const onToggleSelected = vi.fn();
    const user = userEvent.setup();
    mount({}, { isSelected: true, onToggleSelected });

    const button = screen.getByRole('button', { name: 'Deselect event' });
    expect(within(button).getByText('✓')).toBeInTheDocument();
    await user.click(button);
    expect(onToggleSelected).toHaveBeenCalledTimes(1);
  });
});

describe('EventCard — links', () => {
  it('opens the event detail page from the row body', () => {
    mount();
    expect(screen.getByRole('link', { name: /Event-101/ })).toHaveAttribute(
      'href',
      '/events/101',
    );
  });

  it('offers the video as a token-signed download that does not open the event', () => {
    const { onOuterClick } = mount();
    const download = screen.getByRole('link', { name: 'Download video for event 101' });

    expect(download).toHaveAttribute('href', '/api/v3/events/101/video?token=tok-123');
    expect(download).toHaveAttribute('download', 'event-101.mp4');
    expect(download).toHaveAttribute('target', '_blank');

    // The anchor sits outside the <Link>, and stops the click so the row
    // wrapper (in the app, the events list) never sees it as a row click.
    fireEvent.click(download, { cancelable: true });
    expect(onOuterClick).not.toHaveBeenCalled();
  });
});

describe('EventCard — metadata', () => {
  it('flags an archived event', () => {
    mount({ archived: 1 });
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('lists the tags attached to the event', () => {
    mount({ tags: [{ id: 1, name: 'Important' }] });
    expect(screen.getByText('Important')).toBeInTheDocument();
  });

  it('shows the monitor name and the score columns', () => {
    mount();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('4820')).toBeInTheDocument();
    expect(screen.getByText('Tot')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
  });
});
