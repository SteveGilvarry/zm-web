/**
 * `event NNN` in a log message is a link to that event — legacy
 * `views/js/log.js:125` does the same rewrite before the table renders.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

import { LogMessage } from './LogMessage';
import { splitEventRefs } from './eventRefs';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params: Record<string, string> }) => (
    <a href={to.replace('$eventId', params.eventId)}>{children}</a>
  ),
}));

describe('splitEventRefs', () => {
  it('splits every `event NNN` out of the message, keeping the text around it', () => {
    expect(splitEventRefs('Closing event 1234, 5 frames')).toEqual([
      { text: 'Closing ' },
      { text: 'event 1234', eventId: 1234 },
      { text: ', 5 frames' },
    ]);
  });

  it('handles several references and a message that is only a reference', () => {
    expect(splitEventRefs('event 1 then event 22')).toEqual([
      { text: 'event 1', eventId: 1 },
      { text: ' then ' },
      { text: 'event 22', eventId: 22 },
    ]);
    expect(splitEventRefs('event 7')).toEqual([{ text: 'event 7', eventId: 7 }]);
  });

  it('leaves messages without a reference alone, including near-misses', () => {
    expect(splitEventRefs('capture failed')).toEqual([{ text: 'capture failed' }]);
    // Legacy's pattern is lower-case and needs the space + digits.
    expect(splitEventRefs('Event 12 and eventual 3')).toEqual([{ text: 'Event 12 and eventual 3' }]);
  });

  it('is empty for an empty message', () => {
    expect(splitEventRefs('')).toEqual([]);
  });
});

describe('LogMessage', () => {
  it('renders the reference as a link to the event and the rest as text', () => {
    render(<LogMessage message="Closing event 1234 now" />);
    const link = screen.getByRole('link', { name: 'event 1234' });
    expect(link).toHaveAttribute('href', '/events/1234');
    expect(link.parentElement).toHaveTextContent('Closing event 1234 now');
  });

  it('renders a plain message with no links at all', () => {
    render(<LogMessage message="capture failed" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('capture failed')).toBeInTheDocument();
  });
});
