import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, ArrowUpDown, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { defaultMenuLabel, DEFAULT_MENU_ICONS, ICON_TYPES, menuItemLink } from '@/features/menu/menuDefaults';
import { useMenuPage, type MenuRow } from '@/features/menu/useMenuPage';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, classicInput, classicTd, classicTh } from '../components/settings/primitives';

const ICON_TYPE_LABEL: Record<string, string> = {
  material: 'Material',
  fontawesome: 'Font Awesome',
  image: 'Image',
  none: 'None',
};

/**
 * Options → Menu, classic skin (`_options_menu.php`): Save, Add, Sort and
 * Reset over Enabled / Name / Custom Label / Link / Icon. Built-in entries
 * keep their name and link; entries added here can set both.
 */
export default function ClassicMenuPage() {
  const { t } = useTranslation();
  const m = useMenuPage();
  const tabs = useOptionsTabs();
  useSiteTitle(t('Menu'));
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  if (!m.isAuthenticated) return null;

  const iconPreview = (row: MenuRow) => {
    if (row.iconType === 'none') return null;
    const name = row.icon || (row.iconType === 'material' ? DEFAULT_MENU_ICONS[row.menuKey] ?? 'menu' : '');
    if (row.iconType === 'image') {
      return name ? <img src={name} alt="" className="w-6 h-6 object-contain" /> : null;
    }
    // The dashboard ships no Material or Font Awesome font, so the preview
    // is the icon's name rather than its glyph.
    return <code className="text-xs text-zinc-600">{name}</code>;
  };

  return (
    <AppShell title={t('Menu')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="menu" />
            <form
              className="flex-1 min-w-0 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                m.save();
              }}
            >
              <RequirePerm feature="system" level="View" fallback="message">
                {m.canEdit && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <ClassicButton type="submit" tone="primary" disabled={m.isSaving}>
                      <Save size={14} aria-hidden /> {t('Save')}
                    </ClassicButton>
                    <ClassicButton onClick={m.addRow} title={t('Add a new menu entry')}>
                      <Plus size={14} aria-hidden /> {t('Add')}
                    </ClassicButton>
                    <ClassicButton
                      onClick={m.toggleSorting}
                      aria-pressed={m.sorting}
                      title={t('Click and drag rows to change order')}
                      className={clsx(m.sorting && '!bg-[#5cb85c] !border-[#4cae4c] !text-white')}
                    >
                      <ArrowUpDown size={14} aria-hidden /> {t('Sort')}
                    </ClassicButton>
                    {/* A disabled button swallows hover, so the reason sits on a wrapper. */}
                    <span title={m.resetUnavailableReason}>
                      <ClassicButton disabled className="bg-[#f0ad4e] border-[#eea236] text-white">
                        <RotateCcw size={14} aria-hidden /> {t('Reset')}
                      </ClassicButton>
                    </span>
                  </div>
                )}

                {m.saveError && (
                  <div role="alert" className="px-3 py-2 text-sm border border-[#f5c6cb] bg-[#f8d7da] text-[#721c24] rounded-sm">
                    {m.saveError}
                  </div>
                )}

                <QueryState isLoading={m.isLoading} isError={m.isError} error={m.error} onRetry={m.refetch}>
                  <ClassicTable>
                    <thead>
                      <tr>
                        <th className={classicTh}>{t('Enabled')}</th>
                        <th className={classicTh}>{t('Name')}</th>
                        <th className={classicTh}>{t('Custom Label')}</th>
                        <th className={classicTh}>{t('Link')}</th>
                        <th className={classicTh}>{t('Icon')}</th>
                        <th className={classicTh}><span className="sr-only">{t('Actions')}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.rows.map((row, index) => {
                        const caption = row.menuKey ? defaultMenuLabel(t, row.menuKey) : t('Name');
                        const builtinLink = row.builtin ? menuItemLink({ menu_key: row.menuKey, link: null }) : null;
                        return (
                          <tr
                            key={row.rowId}
                            draggable={m.sorting}
                            onDragStart={() => setDragFrom(index)}
                            onDragOver={(e) => {
                              if (m.sorting) e.preventDefault();
                            }}
                            onDrop={() => {
                              if (dragFrom !== null) m.moveRow(dragFrom, index);
                              setDragFrom(null);
                            }}
                            className={clsx(m.sorting && 'cursor-move')}
                          >
                            <td className={classicTd}>
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                disabled={!m.canEdit}
                                aria-label={t('Enable {{name}}', { name: caption })}
                                onChange={(e) => m.updateRow(row.rowId, { enabled: e.target.checked })}
                              />
                            </td>
                            <td className={classicTd}>
                              {row.builtin ? caption : (
                                <input
                                  type="text"
                                  value={row.menuKey}
                                  required
                                  placeholder={t('Name')}
                                  aria-label={t('Name')}
                                  // zm-api renames nothing: a saved entry keeps its key.
                                  disabled={!m.canEdit || row.id != null}
                                  onChange={(e) => m.updateRow(row.rowId, { menuKey: e.target.value })}
                                  className={classicInput}
                                />
                              )}
                            </td>
                            <td className={classicTd}>
                              <input
                                type="text"
                                value={row.label}
                                placeholder={caption}
                                aria-label={t('Custom Label for {{name}}', { name: caption })}
                                disabled={!m.canEdit}
                                onChange={(e) => m.updateRow(row.rowId, { label: e.target.value })}
                                className={classicInput}
                              />
                            </td>
                            <td className={classicTd}>
                              {row.builtin ? (
                                <span className="text-zinc-500">{builtinLink ?? '—'}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={row.link}
                                  placeholder={row.menuKey.trim() ? `?view=${row.menuKey.trim()}` : '?view=... or https://...'}
                                  aria-label={t('Link for {{name}}', { name: caption })}
                                  disabled={!m.canEdit}
                                  onChange={(e) => m.updateRow(row.rowId, { link: e.target.value })}
                                  className={clsx(classicInput, 'w-56')}
                                />
                              )}
                            </td>
                            <td className={classicTd}>
                              <div className="flex items-center gap-1.5">
                                <span className="min-w-6">{iconPreview(row)}</span>
                                <select
                                  value={row.iconType}
                                  disabled={!m.canEdit}
                                  aria-label={t('Icon type for {{name}}', { name: caption })}
                                  onChange={(e) => m.updateRow(row.rowId, { iconType: e.target.value })}
                                  className={classicInput}
                                >
                                  {ICON_TYPES.map((type) => <option key={type} value={type}>{ICON_TYPE_LABEL[type]}</option>)}
                                </select>
                                {row.iconType !== 'none' && (
                                  <input
                                    type="text"
                                    value={row.icon}
                                    placeholder={row.iconType === 'image'
                                      ? 'graphics/menu/icon.png'
                                      : row.iconType === 'material' ? DEFAULT_MENU_ICONS[row.menuKey] ?? 'menu' : ''}
                                    aria-label={t('Icon for {{name}}', { name: caption })}
                                    disabled={!m.canEdit}
                                    onChange={(e) => m.updateRow(row.rowId, { icon: e.target.value })}
                                    className={clsx(classicInput, row.iconType === 'image' ? 'w-52' : 'w-36')}
                                  />
                                )}
                              </div>
                            </td>
                            <td className={clsx(classicTd, 'text-end whitespace-nowrap')}>
                              {m.sorting && (
                                <>
                                  <ClassicButton
                                    onClick={() => m.moveRow(index, index - 1)}
                                    disabled={index === 0}
                                    aria-label={t('Move {{name}} up', { name: caption })}
                                  >
                                    <ArrowUp size={14} aria-hidden />
                                  </ClassicButton>
                                  <ClassicButton
                                    onClick={() => m.moveRow(index, index + 1)}
                                    disabled={index === m.rows.length - 1}
                                    aria-label={t('Move {{name}} down', { name: caption })}
                                    className="ms-1"
                                  >
                                    <ArrowDown size={14} aria-hidden />
                                  </ClassicButton>
                                </>
                              )}
                              {m.canEdit && (
                                <ClassicButton
                                  tone="danger"
                                  className="ms-1"
                                  title={row.id != null ? t('Delete this menu entry') : t('Remove')}
                                  aria-label={row.id != null ? t('Delete {{name}}', { name: caption }) : t('Remove {{name}}', { name: caption })}
                                  onClick={() => (row.id != null ? m.requestDelete(row) : m.removeNewRow(row.rowId))}
                                >
                                  <Trash2 size={14} aria-hidden />
                                </ClassicButton>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </ClassicTable>
                </QueryState>
              </RequirePerm>
            </form>
          </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={m.deleteTarget !== null}
        onClose={m.cancelDelete}
        onConfirm={m.confirmDelete}
        title={t('Delete')}
        message={t('Delete this menu entry?')}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={m.isDeleting}
      />
    </AppShell>
  );
}
