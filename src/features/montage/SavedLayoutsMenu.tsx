import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, Pencil, Bookmark } from 'lucide-react';
import {
  listMontageLayouts,
  createMontageLayout,
  updateMontageLayout,
  deleteMontageLayout,
  type MontageLayout,
} from '@/api/montageLayouts';
import { useAuthStore } from '@/stores/auth';
import type { LayoutNode } from './mosaic';

/**
 * Saved-layout CRUD for the Montage page. Self-contained: owns the
 * dropdown of user-saved layouts plus Save / Rename / Delete buttons.
 *
 * Serialised state lives in `MontageLayout.positions` as JSON. We stash
 * the mosaic tree under the `tree` key so we can detect our format vs
 * legacy ZM rows (flat `[{monitor_id,x,y,w,h}, ...]`).
 */

const QUERY_KEY = ['montageLayouts'] as const;

/** Wire format for what we stuff into the layout's `positions` column. */
interface SerialisedMontageLayout {
  version: 1;
  tree: LayoutNode;
}

function serialise(tree: LayoutNode): string {
  const payload: SerialisedMontageLayout = { version: 1, tree };
  return JSON.stringify(payload);
}

/** Parse a layout's `positions` string. Returns null for legacy/invalid
 *  rows so the caller can warn (instead of crashing the page). */
function parseLayout(positions: string | null): LayoutNode | null {
  if (!positions) return null;
  try {
    const parsed = JSON.parse(positions) as Partial<SerialisedMontageLayout>;
    if (parsed && typeof parsed === 'object' && parsed.version === 1 && parsed.tree) {
      return parsed.tree as LayoutNode;
    }
    return null;
  } catch {
    return null;
  }
}

export interface SavedLayoutsMenuProps {
  /** Current mosaic tree — what gets persisted on Save. */
  currentTree: LayoutNode;
  /** Called when the operator loads a saved layout; receives the
   *  deserialised tree to apply via the montage store. */
  onLoad: (tree: LayoutNode) => void;
}

export function SavedLayoutsMenu({ currentTree, onLoad }: SavedLayoutsMenuProps) {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const qc = useQueryClient();

  // Track which saved layout, if any, is currently loaded — so we know
  // whether Rename / Delete should be enabled and what id to PATCH.
  const [activeId, setActiveId] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listMontageLayouts({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });

  // Show only rows we can actually load — i.e. our own JSON format.
  // Legacy rows (positions==null or flat array format) are hidden so
  // the dropdown doesn't promise something it can't deliver.
  const userLayouts = useMemo<MontageLayout[]>(() => {
    const all = data?.items ?? [];
    return all.filter((l) => parseLayout(l.positions) != null);
  }, [data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createMontageLayout({
        name,
        positions: serialise(currentTree),
        // Fall back to 0 (= system/preset rows in the legacy schema) if
        // the JWT didn't carry a uid — preferable to refusing to save.
        user_id: user?.uid ?? 0,
      }),
    onSuccess: (created) => {
      invalidate();
      setActiveId(created.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { name?: string; positions?: string } }) =>
      updateMontageLayout(id, patch),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMontageLayout(id),
    onSuccess: () => {
      invalidate();
      setActiveId(null);
    },
  });

  const handleSave = () => {
    const name = window.prompt(t('Save layout as:'));
    if (!name || !name.trim()) return;
    createMutation.mutate(name.trim());
  };

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setActiveId(null);
      return;
    }
    const id = Number(raw);
    const row = userLayouts.find((l) => l.id === id);
    if (!row) return;
    const tree = parseLayout(row.positions);
    if (!tree) {
      window.alert(t('That saved layout is in an unsupported format and cannot be loaded.'));
      return;
    }
    setActiveId(id);
    onLoad(tree);
  };

  const handleRename = () => {
    if (activeId == null) return;
    const current = userLayouts.find((l) => l.id === activeId);
    if (!current) return;
    const name = window.prompt(t('Rename layout to:'), current.name);
    if (!name || !name.trim() || name.trim() === current.name) return;
    updateMutation.mutate({ id: activeId, patch: { name: name.trim() } });
  };

  const handleDelete = () => {
    if (activeId == null) return;
    const current = userLayouts.find((l) => l.id === activeId);
    if (!current) return;
    if (!window.confirm(t('Delete saved layout "{{name}}"?', { name: current.name }))) return;
    deleteMutation.mutate(activeId);
  };

  const activeLayout = activeId != null ? userLayouts.find((l) => l.id === activeId) : null;

  return (
    <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
      <Bookmark size={14} className="ms-2 text-text-muted" aria-hidden="true" />

      <select
        aria-label={t('Saved layouts')}
        value={activeId ?? ''}
        onChange={handleSelect}
        className="bg-transparent px-2 py-1 text-[11px] font-mono text-text-secondary hover:text-cyan focus:outline-none focus:text-cyan transition-colors"
      >
        <option value="">{t('Saved layouts…')}</option>
        {userLayouts.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handleSave}
        disabled={createMutation.isPending}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50"
        title={t('Save current arrangement as a new named layout')}
      >
        <Save size={12} />
        {t('Save')}
      </button>

      <button
        type="button"
        onClick={handleRename}
        disabled={activeId == null || updateMutation.isPending}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
        title={activeLayout
          ? t('Rename "{{name}}"', { name: activeLayout.name })
          : t('Load a layout to rename it')}
      >
        <Pencil size={12} />
        {t('Rename')}
      </button>

      <button
        type="button"
        onClick={handleDelete}
        disabled={activeId == null || deleteMutation.isPending}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
        title={activeLayout
          ? t('Delete "{{name}}"', { name: activeLayout.name })
          : t('Load a layout to delete it')}
      >
        <Trash2 size={12} />
        {t('Delete')}
      </button>
    </div>
  );
}
