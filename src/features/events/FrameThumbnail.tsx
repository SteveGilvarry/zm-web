import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { getFrameImageUrl } from '@/api/frames';

/**
 * One frame's JPEG, as legacy's frames list draws it (`ajax/frames.php:188`):
 * an `<img>` at `ZM_WEB_LIST_THUMB_WIDTH`, keyed on the `Frames` row id.
 *
 * `/frames/{id}/image` 404s whenever the event has no JPEGs on disk — every
 * event on an install that records video only. Legacy leaves a broken image
 * there; here the cell falls back to an em dash, so a table of them does not
 * read as a column of failures.
 */
export function FrameThumbnail({ frameId, frameNumber, token, width, className }: {
  frameId: number;
  /** The frame's number within its event, for the alt text. */
  frameNumber: number;
  token?: string | null;
  width: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="text-fg-dim" title={t('No stored image for this frame.')}>&mdash;</span>
    );
  }

  return (
    <img
      src={getFrameImageUrl(frameId, token)}
      alt={t('Frame {{n}}', { n: frameNumber })}
      width={width}
      style={{ width }}
      loading="lazy"
      data-testid={`frame-thumb-${frameId}`}
      onError={() => setFailed(true)}
      className={clsx('inline-block h-auto max-w-none', className)}
    />
  );
}
