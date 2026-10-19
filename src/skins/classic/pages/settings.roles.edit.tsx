import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useRoleEditorPage } from '@/features/roles/useRoleEditorPage';
import { permLevelLabel, rolePermLabel } from '@/features/roles/roleFields';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import type { PagePropsMap } from '@/skins/types';
import { ClassicButton, ClassicTable, classicInput, classicLink, classicTd, classicTh } from '../components/settings/primitives';

const rowTh = 'w-1/3 px-2 py-1.5 text-start font-semibold text-sm border-t border-[#dee2e6] align-middle';
const rowTd = 'px-2 py-1.5 border-t border-[#dee2e6]';

/**
 * The role editor, classic skin (`role.php`): back / refresh, "Role - name",
 * Save / Cancel; Role Details beside Global Permissions; then the users
 * holding the role. The group and monitor permission tables are not here:
 * zm-api has no endpoint for a role's per-group or per-monitor levels.
 */
export default function ClassicRoleEditorPage({ roleId }: PagePropsMap['settings.roles.edit']) {
  const { t } = useTranslation();
  const e = useRoleEditorPage(roleId);
  const heading = `${t('Role')} - ${e.title}`;
  useSiteTitle(heading);

  if (!e.isAuthenticated) return null;

  return (
    <AppShell title={heading}>
      <main className="flex-1 p-4 overflow-auto bg-white">
        {/* Legacy sends anyone without System Edit to the error view. */}
        <RequirePerm feature="system" level="Edit" fallback="message">
          <QueryState isLoading={e.isLoading} isError={e.isError} error={e.error} onRetry={e.refetch}>
            <form
              className="max-w-screen-xl mx-auto space-y-4"
              onSubmit={(ev) => {
                ev.preventDefault();
                e.save();
              }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <ClassicButton onClick={e.cancel} title={t('Back')} aria-label={t('Back')}>
                    <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
                  </ClassicButton>
                  <ClassicButton onClick={e.refetch} title={t('Refresh')} aria-label={t('Refresh')}>
                    <RefreshCw size={14} aria-hidden />
                  </ClassicButton>
                </div>
                <h2 className="flex-1 text-center text-xl font-semibold text-zinc-800">{heading}</h2>
                <div className="flex items-center gap-1">
                  <ClassicButton type="submit" tone="primary" disabled={e.isSaving}>{t('Save')}</ClassicButton>
                  <ClassicButton onClick={e.cancel}>{t('Cancel')}</ClassicButton>
                </div>
              </div>

              {e.saveError && (
                <div role="alert" className="px-3 py-2 text-sm border border-[#f5c6cb] bg-[#f8d7da] text-[#721c24] rounded-sm">
                  {e.saveError}
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <fieldset className="border border-[#dee2e6] px-3 pb-3">
                  <legend className="px-1 text-base">{t('Role Details')}</legend>
                  <table className="w-full text-sm text-zinc-800">
                    <tbody>
                      <tr>
                        <th scope="row" className={rowTh}><label htmlFor="role-name">{t('Name')}</label></th>
                        <td className={rowTd}>
                          <input
                            id="role-name"
                            type="text"
                            value={e.form.name}
                            placeholder={t('New Role')}
                            onChange={(ev) => e.setField('name', ev.target.value)}
                            className={clsx(classicInput, 'w-full')}
                          />
                        </td>
                      </tr>
                      <tr>
                        <th scope="row" className={rowTh}><label htmlFor="role-description">{t('Description')}</label></th>
                        <td className={rowTd}>
                          <textarea
                            id="role-description"
                            rows={3}
                            value={e.form.description}
                            onChange={(ev) => e.setField('description', ev.target.value)}
                            className={clsx(classicInput, 'w-full')}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </fieldset>

                <fieldset className="border border-[#dee2e6] px-3 pb-3">
                  <legend className="px-1 text-base">{t('Global Permissions')}</legend>
                  <table className="w-full text-sm text-zinc-800">
                    <tbody>
                      {e.permRows.map((row) => (
                        <tr key={row.key}>
                          <th scope="row" className={rowTh}>
                            <label htmlFor={`role-${row.key}`}>{rolePermLabel(t, row.key)}</label>
                          </th>
                          <td className={rowTd}>
                            <select
                              id={`role-${row.key}`}
                              value={e.form[row.key]}
                              onChange={(ev) => e.setField(row.key, ev.target.value)}
                              className={clsx(classicInput, 'w-full')}
                            >
                              {row.levels.map((lv) => <option key={lv} value={lv}>{permLevelLabel(t, lv)}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </fieldset>
              </div>

              {!e.isNew && (
                <fieldset className="border border-[#dee2e6] px-3 pb-3">
                  <legend className="px-1 text-base">{t('Assigned Users')}</legend>
                  <ClassicTable>
                    <thead>
                      <tr>
                        <th className={classicTh}>{t('Username')}</th>
                        <th className={classicTh}>{t('Name')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.assignedUsers.length === 0 ? (
                        <tr>
                          <td colSpan={2} className={clsx(classicTd, 'text-zinc-500')}>{t('No users assigned to this role')}</td>
                        </tr>
                      ) : e.assignedUsers.map((u) => (
                        <tr key={u.id}>
                          <td className={classicTd}>
                            <Link to="/settings/users" search={{ uid: u.id }} className={classicLink}>{u.username}</Link>
                          </td>
                          <td className={classicTd}>{u.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </ClassicTable>
                </fieldset>
              )}
            </form>
          </QueryState>
        </RequirePerm>
      </main>
    </AppShell>
  );
}
