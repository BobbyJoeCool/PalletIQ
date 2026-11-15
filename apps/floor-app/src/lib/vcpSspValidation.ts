/**
 * Shared VCP/SSP/SSPs-on-Pallet validation rules (Feature 10, issue #164) — extracted
 * from PAR and PII, which independently implemented the identical business rules under
 * two different names (`checkVcpSsp`/`checkSspCap` in PAR, `vcpSspWarning` in PII).
 *
 * Unlike `useExpirationDateFields` (issue #163), this is **pure functions, not a shared
 * hook** — PAR and PII's actual field-wiring genuinely differs (PAR: raw `useNumpadField`
 * chains with value-ref mirrors and multi-branch screen-wide auto-advance across two
 * entry modes/four fields; PII: `useEditField`'s own commit-callback wrapper) in a way
 * that doesn't collapse into one shared hook without distorting one screen or the other.
 * Only the validation *rule* was actually duplicated — each screen keeps owning its own
 * field wiring and calls into these functions for the check itself.
 */

import { sspPerCarton as computeSspPerCarton, exceedsSspCap } from '@shared/vcpSsp';

export interface VcpSspRatioResult {
  /** True when SSP doesn't evenly divide VCP (or either value isn't a valid positive
   *  integer yet — never flags incomplete input as invalid). */
  ratioInvalid: boolean;
  /** VCP ÷ SSP, only when the ratio is valid — the "how many SSPs make one carton"
   *  figure the SSPs-on-Pallet cap check (below) needs. `null` when not yet computable. */
  sspPerCarton: number | null;
}

/** SSP must evenly divide VCP — the core cross-field rule both PAR and PII enforce. The
 *  rule itself lives in `shared/vcpSsp.ts` (#217, shared with the API); this adapter only
 *  parses raw field strings and treats incomplete input as not-yet-invalid. */
export function checkVcpSspRatio(vcpStr: string, sspStr: string): VcpSspRatioResult {
  const vcp = vcpStr ? parseInt(vcpStr, 10) : NaN;
  const ssp = sspStr ? parseInt(sspStr, 10) : NaN;
  if (!Number.isInteger(vcp) || !Number.isInteger(ssp)) {
    return { ratioInvalid: false, sspPerCarton: null };
  }
  const perCarton = computeSspPerCarton(vcp, ssp);
  return { ratioInvalid: perCarton == null, sspPerCarton: perCarton };
}

/** Loose (non-full-carton) SSPs must stay below one carton's worth (`sspPerCarton`) — a
 *  full carton's worth of "loose" SSPs should just be another whole carton instead. Takes
 *  `sspPerCarton` directly (from `checkVcpSspRatio`'s own result) rather than re-deriving
 *  it, so a caller with multiple loose-SSPs fields (PAR's Single-mode SSPs and
 *  Multiple-mode Partial SSPs) only computes the ratio once. */
export function checkSspCap(sspPerCarton: number | null, looseSspsStr: string): boolean {
  const loose = looseSspsStr ? parseInt(looseSspsStr, 10) : 0;
  if (sspPerCarton == null || !Number.isInteger(loose)) return false;
  return exceedsSspCap(sspPerCarton, loose);
}
