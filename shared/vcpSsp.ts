// VCP/SSP quantity rules — one definition for the floor app's live field checks and the
// API's save-time validation (#217; previously written twice in api/functions/pallets.ts and
// again in apps/floor-app/src/lib/vcpSspValidation.ts).
//
// Both values are item-quantities: VCP = items per carton, SSP = items per store-ship unit.
// `vcp / ssp` is therefore the number of SSPs in one carton ("SSPs per Carton").

/**
 * SSPs per carton for a VCP/SSP pair, or null when the pair is invalid (SSP must be
 * positive and divide VCP evenly).
 */
export function sspPerCarton(vcp: number, ssp: number): number | null {
  if (!Number.isInteger(vcp) || !Number.isInteger(ssp) || ssp <= 0 || vcp % ssp !== 0) return null;
  return vcp / ssp;
}

/** True when SSP is positive and divides VCP evenly. */
export function isValidVcpSspRatio(vcp: number, ssp: number): boolean {
  return sspPerCarton(vcp, ssp) != null;
}

/**
 * True when a loose (partial-carton) SSP count reaches a full carton's worth — a full
 * carton of "loose" SSPs should just be another carton.
 * @param perCarton - SSPs per carton (from `sspPerCarton`)
 * @param looseSsps - the loose SSP count being checked
 */
export function exceedsSspCap(perCarton: number, looseSsps: number): boolean {
  return looseSsps >= perCarton;
}
