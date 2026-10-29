import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/** `new` (or legacy's `rid=0`) opens an empty editor. */
export function parseRoleId(raw: string): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// The trailing underscore keeps this route out of `/settings/roles`, which
// renders no <Outlet/>.
export const Route = createFileRoute('/settings/roles_/$roleId')({
  component: function RoleEditorRoute() {
    const { roleId } = Route.useParams();
    return <SkinPage page="settings.roles.edit" roleId={parseRoleId(roleId)} />;
  },
});
