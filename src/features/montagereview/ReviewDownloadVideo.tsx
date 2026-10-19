import { useState, type ReactNode } from 'react';
import { DownloadVideoModal } from '@/features/events/DownloadVideoModal';
import type { MediaDialogVariant } from '@/features/events/eventMedia';
import type { Monitor } from '@/types';
import type { ReviewEventFilters } from './useReviewEvents';
import { useWindowEvents } from './useWindowEvents';

/**
 * Montage Review's Download Video (legacy `click_download`, which opens the
 * download dialog on the review filter): the events in the window on the
 * selected monitors, packed by zm-api. The caller draws the button.
 */
export function ReviewDownloadVideo({
  monitors, rangeStart, rangeEnd, filters, variant, trigger,
}: {
  monitors: readonly Monitor[];
  rangeStart: Date;
  rangeEnd: Date;
  filters: ReviewEventFilters;
  variant: MediaDialogVariant;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { events, isLoading } = useWindowEvents(monitors, rangeStart, rangeEnd, filters, open);
  return (
    <>
      {trigger(() => setOpen(true))}
      {/* Waits for the load so the dialog opens on the full list, not an empty one. */}
      {open && !isLoading && (
        <DownloadVideoModal
          isOpen
          onClose={() => setOpen(false)}
          ids={events.map((e) => e.id)}
          events={events}
          variant={variant}
        />
      )}
    </>
  );
}
