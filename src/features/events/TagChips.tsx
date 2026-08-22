import { useState, useMemo, type KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Tag as TagIcon, Plus, X } from 'lucide-react';
import { listTags, createTag, attachTag, detachTag, type Tag } from '@/api/tags';

interface TagChipsProps {
  eventId: number;
  currentTags: Array<{ id: number; name: string }>;
}

/**
 * Inline tag editor for an event. Shows attached tags as removable chips and
 * an autocomplete input that surfaces existing tags as you type — Enter on a
 * brand-new value creates the tag and attaches it in one step.
 *
 * Invalidates the parent event query on every mutation so the event detail
 * refreshes its `tags` array without a manual refetch.
 */
export function TagChips({ eventId, currentTags }: TagChipsProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);

  const { data: allTagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ page: 1, page_size: 200 }),
  });
  const allTags: Tag[] = useMemo(() => allTagsData?.items ?? [], [allTagsData]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['event', eventId] });
    qc.invalidateQueries({ queryKey: ['tags'] });
  };

  const attachMutation = useMutation({
    mutationFn: ({ tagId }: { tagId: number }) => attachTag(eventId, tagId),
    onSuccess: invalidate,
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

  // Suggestion list: existing tags that match the input and aren't already on.
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((tag) => !attachedIds.has(tag.id))
      .filter((tag) => tag.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allTags, input, attachedIds]);

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
          <div className="absolute start-0 end-0 mt-1 rounded border border-border bg-surface shadow-[var(--elevation-2)] z-10 overflow-hidden">
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
