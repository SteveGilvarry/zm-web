import {
  useState, useMemo, useImperativeHandle, useRef, type KeyboardEvent, type RefObject,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Tag as TagIcon, Plus, X } from 'lucide-react';
import { listTags, createTag, attachTag, detachTag, type Tag } from '@/api/tags';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import { orderByRecency } from './tagOrder';


/** What the page's keyboard shortcuts can ask of the editor (legacy J:77–83). */
export interface TagChipsApi {
  /** ↓ — put the caret in the tag box and open its dropdown. */
  focus: () => void;
  /**
   * Ctrl+↓ / tagPrev / tagNext — legacy `addTag(availableTags[0])`: the tag
   * this operator applied last. Already on this event, it does nothing, as
   * in legacy. With nothing applied yet in this session, the first tag not
   * already on.
   */
  addFirst: () => void;
}

interface TagChipsProps {
  eventId: number;
  currentTags: Array<{ id: number; name: string }>;
  /** Filled with the `TagChipsApi` while the editor is mounted. */
  apiRef?: RefObject<TagChipsApi | null>;
}

/**
 * Inline tag editor for an event. Shows attached tags as removable chips and
 * an input whose dropdown lists the free tags, most recently used first, as
 * soon as it has focus (legacy opens it on focus and on ↓) and narrows as you
 * type — Enter on a brand-new value creates the tag and attaches it.
 *
 * Invalidates the parent event query on every mutation so the event detail
 * refreshes its `tags` array without a manual refetch.
 */
export function TagChips({ eventId, currentTags, apiRef }: TagChipsProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ page: 1, page_size: 200 }),
  });
  const recency = useEventPlaybackStore((st) => st.tagRecency);
  const noteTagUsed = useEventPlaybackStore((st) => st.noteTagUsed);
  const allTags: Tag[] = useMemo(
    () => orderByRecency(allTagsData?.items ?? [], recency),
    [allTagsData, recency],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['event', eventId] });
    qc.invalidateQueries({ queryKey: ['tags'] });
  };

  const attachMutation = useMutation({
    mutationFn: ({ tagId }: { tagId: number }) => attachTag(eventId, tagId),
    // Legacy moves the tag it just added to the front of `availableTags`.
    onSuccess: (_data, { tagId }) => {
      noteTagUsed(tagId);
      invalidate();
    },
  });
  const detachMutation = useMutation({
    mutationFn: ({ tagId }: { tagId: number }) => detachTag(eventId, tagId),
    onSuccess: invalidate,
  });
  const createMutation = useMutation({
    mutationFn: (name: string) => createTag(name),
    onSuccess: (tag) => attachMutation.mutate({ tagId: tag.id }),
  });

  const attachedIds = useMemo(
    () => new Set(currentTags.map((tag) => tag.id)),
    [currentTags],
  );

  // Legacy `showDropdown`: every tag not already on that contains the
  // input — all of them while it is empty, so focus alone opens the list.
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    return allTags
      .filter((tag) => !attachedIds.has(tag.id))
      .filter((tag) => tag.name.toLowerCase().includes(q));
  }, [allTags, input, attachedIds]);

  // The tag Tag & Next applies: the last one this operator used, or the
  // first free one before they have used any.
  const lastUsed = useMemo(
    () => allTags.find((tag) => recency.includes(tag.id)) ?? null,
    [allTags, recency],
  );
  const firstFree = useMemo(
    () => allTags.find((tag) => !attachedIds.has(tag.id)) ?? null,
    [allTags, attachedIds],
  );

  useImperativeHandle(apiRef, () => ({
    focus: () => {
      inputRef.current?.focus();
      setFocused(true);
    },
    addFirst: () => {
      const tag = lastUsed ?? firstFree;
      if (tag && !attachedIds.has(tag.id)) attachMutation.mutate({ tagId: tag.id });
    },
    // `attachMutation` is stable enough for this (react-query keeps the
    // identity per render, and the handle is read on demand, not stored).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lastUsed, firstFree, attachedIds]);

  const exactMatch = useMemo(() => {
    const q = input.trim().toLowerCase();
    return q && allTags.find((tag) => tag.name.toLowerCase() === q);
  }, [allTags, input]);

  const submit = () => {
    const name = input.trim();
    if (!name) return;
    if (exactMatch) {
      if (!attachedIds.has(exactMatch.id)) {
        attachMutation.mutate({ tagId: exactMatch.id });
      }
    } else {
      createMutation.mutate(name);
    }
    setInput('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setInput('');
    }
  };

  return (
    <div className="space-y-3">
      {/* Attached chips */}
      <div className="flex flex-wrap gap-1.5">
        {currentTags.length === 0 ? (
          <span className="text-xs text-fg-dim">{t('No tags')}</span>
        ) : (
          currentTags.map((tag) => (
            <span
              key={tag.id}
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs',
                'bg-surface-2 border border-border-subtle text-fg-muted',
              )}
            >
              <TagIcon size={10} aria-hidden />
              {tag.name}
              <button
                onClick={() => detachMutation.mutate({ tagId: tag.id })}
                disabled={detachMutation.isPending}
                aria-label={t('Remove tag {{name}}', { name: tag.name })}
                className="ms-0.5 -me-0.5 hover:text-fg transition-colors disabled:opacity-50"
              >
                <X size={10} />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Input + suggestions */}
      <div className="relative">
        <div className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded border bg-surface',
          focused ? 'border-accent' : 'border-border-subtle',
          'transition-colors',
        )}>
          <Plus size={12} className="text-fg-dim" aria-hidden />
          <input
            ref={inputRef}
            data-testid="tag-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={t('Add tag…')}
            className="flex-1 bg-transparent text-xs text-fg placeholder:text-fg-faint focus:outline-none"
          />
          {input.trim() && (
            <button
              onClick={submit}
              disabled={attachMutation.isPending || createMutation.isPending}
              className="px-2 py-0.5 text-xs font-medium rounded bg-accent text-accent-fg hover:bg-accent-dim transition-colors disabled:opacity-50"
            >
              {exactMatch ? t('Add') : t('Create')}
            </button>
          )}
        </div>

        {focused && suggestions.length > 0 && (
          <div
            data-testid="tag-suggestions"
            className="absolute start-0 end-0 mt-1 max-h-60 overflow-y-auto rounded border border-border bg-surface shadow-[var(--elevation-2)] z-10"
          >
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                onClick={() => {
                  attachMutation.mutate({ tagId: tag.id });
                  setInput('');
                }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1 text-start text-xs text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
              >
                <TagIcon size={10} aria-hidden />
                {tag.name}
                {tag.event_count != null && (
                  <span className="ms-auto font-mono tabular-nums text-xs text-fg-dim">
                    {tag.event_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
