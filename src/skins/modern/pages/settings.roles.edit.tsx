import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Info, Loader2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { QueryState } from '@/components/common/QueryState';
import { Select } from '@/components/common/Select';
import { TextField } from '@/components/common/TextField';
import { Textarea } from '@/components/common/Textarea';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useRoleEditorPage } from '@/features/roles/useRoleEditorPage';
import { permLevelLabel, rolePermLabel } from '@/features/roles/roleFields';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import type { PagePropsMap } from '@/skins/types';

const SECTION = 'space-y-3';
const SECTION_TITLE = 'text-xs font-medium text-fg-dim';

/**
 * Settings → Roles → one role, modern skin: name and description, the
 * eight levels in a grid of selects, and the users that hold it.
 */
export default function SettingsRoleEditorPage({ roleId }: PagePropsMap['settings.roles.edit']) {
  const { t } = useTranslation();
  const e = useRoleEditorPage(roleId);
  const title = e.isNew ? t('New Role') : e.title;
  useSiteTitle(title);

  if (!e.isAuthenticated) return null;

  return (
    <AppShell title={t('Roles')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="Edit" fallback="message">
          <QueryState isLoading={e.isLoading} isError={e.isError} error={e.error} onRetry={e.refetch}>
            <form
              className="mx-auto w-full max-w-3xl space-y-6"
              onSubmit={(ev) => {
                ev.preventDefault();
                e.save();
              }}
            >
              <div className="flex items-center gap-3">
                <Button size="sm" variant="ghost" icon onClick={e.cancel} aria-label={t('Back to roles')} title={t('Back to roles')}>
                  <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
                </Button>
                <h2 className="text-sm font-medium text-fg">{title}</h2>
              </div>

              <section className={SECTION}>
                <TextField
                  label={t('Name')}
                  value={e.form.name}
                  onChange={(ev) => e.setField('name', ev.target.value)}
                  placeholder={t('New Role')}
                  required
                />
                <Textarea
                  label={t('Description')}
                  value={e.form.description}
                  onChange={(ev) => e.setField('description', ev.target.value)}
                />
              </section>

              <section className={SECTION}>
                <h3 className={SECTION_TITLE}>{t('Global Permissions')}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {e.permRows.map((row) => (
                    <Select
                      key={row.key}
                      label={rolePermLabel(t, row.key)}
                      value={e.form[row.key]}
                      onChange={(ev) => e.setField(row.key, ev.target.value)}
                    >
                      {row.levels.map((lv) => <option key={lv} value={lv}>{permLevelLabel(t, lv)}</option>)}
                    </Select>
                  ))}
                </div>
                <p className="flex items-start gap-2 text-xs text-fg-dim">
                  <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                  {t('Per-group and per-monitor permissions for a role are not available: the API does not serve them yet.')}
                </p>
              </section>

              {!e.isNew && (
                <section className={SECTION}>
                  <h3 className={SECTION_TITLE}>{t('Assigned Users')}</h3>
                  {e.assignedUsers.length === 0 ? (
                    <p className="text-sm text-fg-dim">{t('No users assigned to this role')}</p>
                  ) : (
                    <ul className="divide-y divide-border-subtle rounded border border-border-subtle text-sm">
                      {e.assignedUsers.map((u) => (
                        <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                          <Link to="/settings/users" search={{ uid: u.id }} className="font-medium text-fg hover:text-accent hover:underline">
                            {u.username}
                          </Link>
                          <span className="text-fg-muted">{u.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {e.saveError && (
                <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
                  {e.saveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <Button onClick={e.cancel}>{t('Cancel')}</Button>
                <Button type="submit" variant="primary" disabled={e.isSaving}>
                  {e.isSaving && <Loader2 size={14} className="animate-spin" aria-hidden />}
                  {t('Save')}
                </Button>
              </div>
            </form>
          </QueryState>
        </RequirePerm>
      </main>
    </AppShell>
  );
}
