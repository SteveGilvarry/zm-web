import { useState, useMemo, type KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
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
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);

  const { data: allTagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ page: 1, page_size: 200 }),
  });
  const allTags: Tag[] = allTagsData?.items ?? [];

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
    () => new Set(currentTags.map((t) => t.id)),
    [currentTags],
  );

  // Suggestion list: existing tags that match the input and aren't already on.
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => !attachedIds.has(t.id))
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allTags, input, attachedIds]);

  const exactMatch = useMemo(() => {
    const q = input.trim().toLowerCase();
    return q && allTags.find((t) => t.name.toLowerCase() === q);
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
          <span className="text-xs text-text-muted italic">No tags</span>
        ) : (
          currentTags.map((t) => (
            <span
              key={t.id}
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md',
                'bg-cyan/15 border border-cyan/40 text-cyan text-xs',
              )}
            >
              <TagIcon size={10} />
              {t.name}
              <button
                onClick={() => detachMutation.mutate({ tagId: t.id })}
                disabled={detachMutation.isPending}
                aria-label={`Remove tag ${t.name}`}
                className="ml-0.5 -mr-0.5 hover:text-text-primary transition-colors disabled:opacity-50"
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
          'flex items-center gap-1.5 px-2 py-1.5 rounded-md border',
          focused ? 'border-cyan/50 bg-surface' : 'border-border-subtle bg-surface/50',
          'transition-colors',
        )}>
          <Plus size={12} className="text-text-muted" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Add tag…"
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          {input.trim() && (
            <button
              onClick={submit}
              disabled={attachMutation.isPending || createMutation.isPending}
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-cyan/20 text-cyan hover:bg-cyan/30 transition-colors disabled:opacity-50"
            >
              {exactMatch ? 'Add' : 'Create'}
            </button>
          )}
        </div>

        {focused && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 mt-1 rounded-md border border-border bg-panel shadow-lg z-10 overflow-hidden">
            {suggestions.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  attachMutation.mutate({ tagId: t.id });
                  setInput('');
                }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-text-secondary hover:bg-cyan/10 hover:text-cyan transition-colors"
              >
                <TagIcon size={10} />
                {t.name}
                {t.event_count != null && (
                  <span className="ml-auto text-[10px] text-text-muted">
                    {t.event_count}
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
