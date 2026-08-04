import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest } from '../lib/functionsRuntime.js';
import { requireAuth } from '../lib/permissions.js';
import { withHandler } from '../lib/response.js';
import { getReasonCodesForDomain, getUserAccessiblePrefixes } from '../lib/reasonCodes.js';

/**
 * Reason-code picker data for a domain (issue #84) — the shared `ReasonCodeField`'s data
 * source. Returns this user's own accessible prefixes (derived live from their department/
 * cross-training/role, never cached) plus every reason code valid for the requested
 * domain, each annotated with which prefixes (if any) restrict it. The frontend filters
 * `reasons` by whichever prefix is currently selected; `validateReasonCode` (used by every
 * write path that accepts a reason code) re-checks the real access rule server-side on
 * submit regardless, so this filtering is a UI convenience, not a security boundary.
 *
 * @param req - HTTP request with query param `domain` (`HOLD` or `PALLET_ADJUST`)
 * @returns `{ prefixes: [{letter, desc}], reasons: [{number, desc, restrictedToPrefixes}] }`
 * @throws 400 INVALID_INPUT if `domain` is missing or not one of the two known values
 */
async function getReasonCodes(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);

  const domain = new URL(req.url).searchParams.get('domain');
  if (domain !== 'HOLD' && domain !== 'PALLET_ADJUST') {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const [prefixes, reasons] = await Promise.all([
    getUserAccessiblePrefixes(auth.zNumber, auth.role),
    getReasonCodesForDomain(domain),
  ]);

  return { prefixes, reasons };
}

app.http('getReasonCodes', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reason-codes',
  handler: withHandler(getReasonCodes),
});
