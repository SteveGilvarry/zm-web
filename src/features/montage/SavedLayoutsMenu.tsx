import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, Pencil, Bookmark, RefreshCw } from 'lucide-react';
import {
  listMontageLayouts,
  createMontageLayout,
  updateMontageLayout,
  deleteMontageLayout,
  type MontageLayout,
} from '@/api/montageLayouts';
import { useAuthStore } from '@/stores/auth';
import type { MontageStatusPosition } from '@/stores/montage';
import type { LayoutNode } from './mosaic';
import { parsePositions, serialisePositions, type ParsedLayout } from './layoutFormat';

/**
 * Saved-layout CRUD for the Montage page. Self-contained: owns the
 * dropdown of saved layouts plus Save / Update / Rename / Delete buttons.
 *
 * Rows are shared with legacy ZoneMinder (see `layoutFormat.ts`): its
 * gridstack layouts load here (converted to a split tree), and what we save
 * carries a gridstack projection legacy can open plus our exact tree. The
 * built-in preset rows (`positions: null`, e.g. "4 Wide") are not listed —
 * the preset buttons cover those.
 */

const QUERY_KEY = ['montageLayouts'] as const;

export interface SavedLayoutsMenuProps {
  /** Current mosaic tree — what gets persisted on Save / Update. */
  currentTree: LayoutNode;
  /** Persisted alongside the tree (legacy `monitorStatusPosition`). */
  statusPosition: MontageStatusPosition;
  /** Called when the operator loads a saved layout. */
  onLoad: (layout: ParsedLayout) => void;
}

export function SavedLayoutsMenu({ currentTree, statusPosition, onLoad }: SavedLayoutsMenuProps) {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const qc = useQueryClient();

  // Track which saved layout, if any, is currently loaded — so we know
  // whether Update / Rename / Delete should be enabled and what id to PATCH.
  const [activeId, setActiveId] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listMontageLayouts({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });

  const userLayouts = useMemo<Array<MontageLayout & { parsed: ParsedLayout }>>(() => {
    const all = data?.items ?? [];
    return all
      .map((l) => ({ ...l, parsed: parsePositions(l.positions) }))
      .filter((l): l is MontageLayout & { parsed: ParsedLayout } => l.parsed != null)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const positions = () => serialisePositions(currentTree, statusPosition);

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createMontageLayout({
        name,
        positions: positions(),
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

  const handleUpdate = () => {
    if (activeId == null) return;
    updateMutation.mutate({ id: activeId, patch: { positions: positions() } });
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
    setActiveId(id);
    onLoad(row.parsed);
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
  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const btn = 'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium text-text-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted';

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
            {l.parsed.source === 'gridstack' ? t('{{name}} (legacy grid)', { name: l.name }) : l.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handleSave}
        disabled={busy}
        className={`${btn} hover:text-cyan hover:bg-cyan/10`}
        title={t('Save current arrangement as a new named layout')}
      >
        <Save size={12} />
        {t('Save')}
      </button>

      <button
        type="button"
        onClick={handleUpdate}
        disabled={activeId == null || busy}
        className={`${btn} hover:text-cyan hover:bg-cyan/10`}
        title={activeLayout
          ? t('Overwrite "{{name}}" with the current arrangement', { name: activeLayout.name })
          : t('Load a layout to update it')}
      >
        <RefreshCw size={12} />
        {t('Update')}
      </button>

      <button
        type="button"
        onClick={handleRename}
        disabled={activeId == null || busy}
        className={`${btn} hover:text-cyan hover:bg-cyan/10`}
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
        disabled={activeId == null || busy}
        className={`${btn} hover:text-crimson hover:bg-crimson/10`}
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
