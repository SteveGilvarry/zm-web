import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { defaultMenuLabel, DEFAULT_MENU_ICONS, ICON_TYPES, menuItemLink } from '@/features/menu/menuDefaults';
import { useMenuPage } from '@/features/menu/useMenuPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

const th = 'px-3 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const iconBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Settings → Menu, modern skin: which navbar entries show, in what order,
 * under what label. Edits are a draft until Save.
 */
export default function SettingsMenuPage() {
  const { t } = useTranslation();
  const m = useMenuPage();
  useSiteTitle(t('Menu'));
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  if (!m.isAuthenticated) return null;

  const iconTypeLabel: Record<string, string> = {
    material: t('Material'),
    fontawesome: t('Font Awesome'),
    image: t('Image'),
    none: t('None'),
  };

  return (
    <AppShell title={t('Menu')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="View" fallback="message">
          <form
            className="mx-auto w-full max-w-[1400px] space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              m.save();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-fg">{t('Menu')}</h2>
                <p className="text-xs text-fg-dim">{t('The navigation entries, their order and labels.')}</p>
              </div>
              {m.canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <span title={m.resetUnavailableReason}>
                    <Button size="sm" variant="ghost" disabled>
                      <RotateCcw size={13} aria-hidden />
                      {t('Reset')}
                    </Button>
                  </span>
                  <Button size="sm" variant={m.sorting ? 'secondary' : 'ghost'} onClick={m.toggleSorting} aria-pressed={m.sorting}>
                    <GripVertical size={13} aria-hidden />
                    {m.sorting ? t('Done sorting') : t('Sort')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={m.addRow}>
                    <Plus size={13} aria-hidden />
                    {t('Add entry')}
                  </Button>
                  {m.dirty && <Button size="sm" onClick={m.discard}>{t('Discard')}</Button>}
                  <Button size="sm" type="submit" variant="primary" disabled={!m.dirty || m.isSaving}>
                    {m.isSaving && <Loader2 size={13} className="animate-spin" aria-hidden />}
                    {t('Save')}
                  </Button>
                </div>
              )}
            </div>

            {m.saveError && (
              <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-2 text-xs text-danger">{m.saveError}</div>
            )}

            <div className="rounded border border-border-subtle overflow-hidden">
              <QueryState isLoading={m.isLoading} isError={m.isError} error={m.error} onRetry={m.refetch}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        <th className={th}>{t('Shown')}</th>
                        <th className={th}>{t('Entry')}</th>
                        <th className={th}>{t('Label')}</th>
                        <th className={th}>{t('Link')}</th>
                        <th className={th}>{t('Icon')}</th>
                        <th className={th}><span className="sr-only">{t('Actions')}</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {m.rows.map((row, index) => {
                        const caption = row.menuKey ? defaultMenuLabel(t, row.menuKey) : t('New entry');
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
                            className={clsx('transition-colors', m.sorting ? 'cursor-move' : 'hover:bg-surface-2', !row.enabled && 'text-fg-dim')}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                disabled={!m.canEdit}
                                aria-label={t('Enable {{name}}', { name: caption })}
                                onChange={(e) => m.updateRow(row.rowId, { enabled: e.target.checked })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              {row.builtin || row.id != null ? (
                                <span className="font-medium">{caption}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={row.menuKey}
                                  required
                                  placeholder={t('Name')}
                                  aria-label={t('Name')}
                                  onChange={(e) => m.updateRow(row.rowId, { menuKey: e.target.value })}
                                  className={fieldClasses('sm')}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.label}
                                placeholder={caption}
                                disabled={!m.canEdit}
                                aria-label={t('Custom Label for {{name}}', { name: caption })}
                                onChange={(e) => m.updateRow(row.rowId, { label: e.target.value })}
                                className={fieldClasses('sm')}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {row.builtin ? (
                                <span className="text-fg-dim">{menuItemLink({ menu_key: row.menuKey, link: null }) ?? '—'}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={row.link}
                                  placeholder={row.menuKey.trim() ? `?view=${row.menuKey.trim()}` : 'https://…'}
                                  disabled={!m.canEdit}
                                  aria-label={t('Link for {{name}}', { name: caption })}
                                  onChange={(e) => m.updateRow(row.rowId, { link: e.target.value })}
                                  className={fieldClasses('sm')}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <select
                                  value={row.iconType}
                                  disabled={!m.canEdit}
                                  aria-label={t('Icon type for {{name}}', { name: caption })}
                                  onChange={(e) => m.updateRow(row.rowId, { iconType: e.target.value })}
                                  className={clsx(fieldClasses('sm'), 'w-auto')}
                                >
                                  {ICON_TYPES.map((type) => <option key={type} value={type}>{iconTypeLabel[type]}</option>)}
                                </select>
                                {row.iconType !== 'none' && (
                                  <input
                                    type="text"
                                    value={row.icon}
                                    placeholder={row.iconType === 'image' ? 'graphics/menu/icon.png'
                                      : row.iconType === 'material' ? DEFAULT_MENU_ICONS[row.menuKey] ?? 'menu' : ''}
                                    disabled={!m.canEdit}
                                    aria-label={t('Icon for {{name}}', { name: caption })}
                                    onChange={(e) => m.updateRow(row.rowId, { icon: e.target.value })}
                                    className={clsx(fieldClasses('sm'), 'font-mono text-xs')}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-1">
                                {m.sorting && (
                                  <>
                                    <button type="button" className={iconBtn} disabled={index === 0}
                                      onClick={() => m.moveRow(index, index - 1)} aria-label={t('Move {{name}} up', { name: caption })}>
                                      <ArrowUp size={14} />
                                    </button>
                                    <button type="button" className={iconBtn} disabled={index === m.rows.length - 1}
                                      onClick={() => m.moveRow(index, index + 1)} aria-label={t('Move {{name}} down', { name: caption })}>
                                      <ArrowDown size={14} />
                                    </button>
                                  </>
                                )}
                                {m.canEdit && (
                                  <button
                                    type="button"
                                    className="p-1.5 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
                                    aria-label={row.id != null ? t('Delete {{name}}', { name: caption }) : t('Remove {{name}}', { name: caption })}
                                    title={row.id != null ? t('Delete this menu entry') : t('Remove')}
                                    onClick={() => (row.id != null ? m.requestDelete(row) : m.removeNewRow(row.rowId))}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </QueryState>
            </div>
          </form>
        </RequirePerm>
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
