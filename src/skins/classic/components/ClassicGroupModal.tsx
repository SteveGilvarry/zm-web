import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import type { Group } from '@/api/groups';
import type { Monitor } from '@/types';
import { getValidParentOptions } from '@/features/groups/tree';
import { ClassicButton, classicInputClass } from '@/skins/classic/components';
import { ChosenMultiSelect } from './ChosenMultiSelect';

interface ClassicGroupModalProps {
  open: boolean;
  /** `null` for New. */
  editing: Group | null;
  groups: Group[];
  monitors: Monitor[];
  initialMonitorIds: number[];
  onClose: () => void;
  onSubmit: (input: { name: string; parentId: number | null; monitorIds: number[] }) => void;
  pending?: boolean;
  error?: string | null;
}

/**
 * Legacy's group modal (`ajax/modals/group.php`): "Group" or "Group - Name",
 * then Name, Parent Group and Monitor rows, Save and Cancel. The parent list
 * is "None" plus every other group by name, indented by depth, leaving out
 * this group and its descendants (`parentGrpSelect`). Save waits for a name
 * (`configModalBtns`).
 */
export function ClassicGroupModal({ open, editing, ...rest }: ClassicGroupModalProps) {
  if (!open) return null;
  // Keyed so every open, and every switch of group, starts from fresh state.
  return <GroupModalForm key={editing?.id ?? 'new'} editing={editing} {...rest} />;
}

function GroupModalForm({
  editing, groups, monitors, initialMonitorIds, onClose, onSubmit, pending = false, error = null,
}: Omit<ClassicGroupModalProps, 'open'>) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [parentId, setParentId] = useState<number | null>(editing?.parent_id ?? null);
  const [monitorIds, setMonitorIds] = useState<number[]>(initialMonitorIds);

  // `ORDER BY Name`, indented two spaces per level.
  const parents = getValidParentOptions(groups, editing?.id ?? null)
    .slice()
    .sort((a, b) => a.group.name.localeCompare(b.group.name));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, parentId, monitorIds });
  };

  const title = editing?.name ? t('Group - {{name}}', { name: editing.name }) : t('Group');
  const th = 'text-end font-semibold pe-3 py-1 align-top whitespace-nowrap';

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <form onSubmit={submit} className="text-sm text-zinc-900">
        <table className="w-full">
          <tbody>
            <tr>
              <th scope="row" className={th}>
                <label htmlFor="classic-group-name">{t('Name')}</label>
              </th>
              <td className="py-1">
                <input
                  id="classic-group-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  className={`${classicInputClass} w-full`}
                />
              </td>
            </tr>
            <tr>
              <th scope="row" className={th}>
                <label htmlFor="classic-group-parent">{t('Parent Group')}</label>
              </th>
              <td className="py-1">
                <select
                  id="classic-group-parent"
                  value={parentId === null ? '' : String(parentId)}
                  onChange={(e) => setParentId(e.target.value === '' ? null : Number(e.target.value))}
                  className={classicInputClass}
                >
                  <option value="">{t('None')}</option>
                  {parents.map(({ group, depth }) => (
                    <option key={group.id} value={group.id}>
                      {'  '.repeat(depth)}{group.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <th scope="row" className={th}>
                <label htmlFor="classic-group-monitors">{t('Monitor')}</label>
              </th>
              <td className="py-1">
                <ChosenMultiSelect
                  id="classic-group-monitors"
                  label={t('Monitor')}
                  options={monitors.map((m) => ({ value: m.id, label: m.name }))}
                  value={monitorIds}
                  onChange={setMonitorIds}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {error && (
          <p role="alert" className="mt-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-red-800">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-zinc-200">
          <ClassicButton type="submit" tone="primary" disabled={pending || !name.trim()}>
            {t('Save')}
          </ClassicButton>
          <ClassicButton onClick={onClose}>{t('Cancel')}</ClassicButton>
        </div>
      </form>
    </Modal>
  );
}
