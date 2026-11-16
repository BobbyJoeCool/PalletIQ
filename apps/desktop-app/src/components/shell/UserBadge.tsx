import type { DesktopUser } from '../../lib/api';
import { isIcqaDepartment, roleLabel } from '../../lib/roleLabel';

/**
 * Read-only display of who is signed in: name, zNumber, and their position shown with
 * the desktop's labels (LWW/OM), plus an ICQA marker when their home department is ICQA.
 */
export function UserBadge({ user }: { user: DesktopUser }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-sm font-semibold text-[var(--text-primary)]">
        {user.firstName} {user.lastName}
      </span>
      <span className="text-xs text-[var(--text-muted)]">
        <span className="font-data">{user.zNumber}</span> · {roleLabel(user.role)}
        {isIcqaDepartment(user.departmentId) && ' · ICQA'}
      </span>
    </div>
  );
}
