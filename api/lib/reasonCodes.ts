import prisma from './prisma.js';
import { hasMinRole } from './permissions.js';
import type { Role } from './jwt.js';

export interface AccessiblePrefix {
  letter: string;
  desc: string;
}

export interface ReasonCodeOption {
  number: string;
  desc: string;
  /** Prefixes this reason is restricted to, or null if available under any prefix. */
  restrictedToPrefixes: string[] | null;
}

/**
 * Computes the full set of reason-code prefixes this user can currently use (issue #84) —
 * derived live from their home department, any cross-training (`UserDepartment`), and
 * role, every time this is called. Nothing is granted or cached ahead of time: change a
 * user's role or department membership and the very next call reflects it immediately.
 *
 * @param zNumber - The authenticated user's zNumber
 * @param role - The authenticated user's role, from the JWT payload
 */
export async function getUserAccessiblePrefixes(zNumber: string, role: Role): Promise<AccessiblePrefix[]> {
  const user = await prisma.user.findUnique({
    where: { zNumber },
    select: { departmentId: true, userDepartments: { select: { departmentId: true } } },
  });
  if (!user) return [];

  const departmentIds = new Set([user.departmentId, ...user.userDepartments.map((d) => d.departmentId)]);

  const prefixes = await prisma.reasonCodePrefix.findMany();
  const accessible = prefixes.filter((p) =>
    (p.departmentId != null && departmentIds.has(p.departmentId)) ||
    (p.minRole != null && hasMinRole(role, p.minRole as Role)),
  );
  // Home department first — gives the frontend an unambiguous default to pre-select when
  // a field mounts with no other value/session-sticky prefix to fall back on yet.
  accessible.sort((a, b) => {
    const aHome = a.departmentId === user.departmentId ? 0 : 1;
    const bHome = b.departmentId === user.departmentId ? 0 : 1;
    return aHome - bHome;
  });
  return accessible.map((p) => ({ letter: p.letter, desc: p.desc }));
}

/**
 * Every reason code valid for a given domain (`HOLD`/`PALLET_ADJUST`), annotated with
 * which prefixes (if any) restrict it — `restrictedToPrefixes: null` means available under
 * any prefix the caller can access. Not filtered by the requesting user's own accessible
 * prefixes; the frontend filters this flat list by whichever prefix is currently selected,
 * and `validateReasonCode` below re-checks the real access rule server-side on submit.
 *
 * @param domain - `HOLD` or `PALLET_ADJUST`
 */
export async function getReasonCodesForDomain(domain: string): Promise<ReasonCodeOption[]> {
  const domainRows = await prisma.reasonCodeDomain.findMany({
    where: { domain },
    select: { reasonCodeNumber: true },
  });
  const numbers = domainRows.map((d) => d.reasonCodeNumber);
  if (numbers.length === 0) return [];

  const [reasons, allowances] = await Promise.all([
    prisma.reasonCode.findMany({ where: { number: { in: numbers } } }),
    prisma.reasonCodePrefixAllowance.findMany({ where: { reasonCodeNumber: { in: numbers } } }),
  ]);

  const allowanceMap = new Map<string, string[]>();
  for (const a of allowances) {
    if (!allowanceMap.has(a.reasonCodeNumber)) allowanceMap.set(a.reasonCodeNumber, []);
    allowanceMap.get(a.reasonCodeNumber)!.push(a.prefixLetter);
  }

  return reasons
    .map((r) => ({ number: r.number, desc: r.desc, restrictedToPrefixes: allowanceMap.get(r.number) ?? null }))
    .sort((a, b) => a.number.localeCompare(b.number));
}

/**
 * Validates a prefix+number combination is actually usable by this user for the given
 * domain — re-derived and re-checked server-side on every write, never trusting the
 * client's own already-filtered dropdown. Every write path that accepts a reason code
 * (`placeHold`, `placeRangeHold`, `editPallet`) calls this before persisting anything.
 *
 * @throws 400 INVALID_INPUT if the prefix isn't accessible to this user, the number
 *   doesn't exist, the number is restricted to prefixes that don't include this one, or
 *   the number isn't valid for this domain
 */
export async function validateReasonCode(
  zNumber: string,
  role: Role,
  domain: string,
  prefix: string,
  number: string,
): Promise<void> {
  const accessible = await getUserAccessiblePrefixes(zNumber, role);
  if (!accessible.some((p) => p.letter === prefix)) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const reasonCode = await prisma.reasonCode.findUnique({ where: { number } });
  if (!reasonCode) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const domainRow = await prisma.reasonCodeDomain.findUnique({
    where: { reasonCodeNumber_domain: { reasonCodeNumber: number, domain } },
  });
  if (!domainRow) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const allowanceCount = await prisma.reasonCodePrefixAllowance.count({ where: { reasonCodeNumber: number } });
  if (allowanceCount > 0) {
    const allowed = await prisma.reasonCodePrefixAllowance.findUnique({
      where: { reasonCodeNumber_prefixLetter: { reasonCodeNumber: number, prefixLetter: prefix } },
    });
    if (!allowed) {
      throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    }
  }
}
