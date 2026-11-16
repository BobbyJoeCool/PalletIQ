// Typed activity events (#218) — the constructors that build the ActivityLog entries IRP
// reads, each setting its own `actionType` + `functionCode`. Before this module each call
// site picked its own functionCode string (puts.ts ×3, staging.ts, pulls.ts), and IRP's
// totals silently depended on those picks. IRP's own source table (`IRP_FUNCTION_SOURCES`)
// lives here too, so the writer and the reader of each code are one module.

import type { LogEntry } from './activityLog.js';

/** IRP prod-function codes that have a real ActivityLog data path. */
export type IrpFunctionCode = 'CA' | 'CF' | 'FP' | 'RP' | 'HP' | 'GPM' | 'CON';

/**
 * Which ActivityLog rows feed each IRP function: rows carrying the function code, written
 * with this actionType by the constructor named. IRP queries by `functionCode`.
 */
export const IRP_FUNCTION_SOURCES: Record<IrpFunctionCode, { actionType: string; writtenBy: string }> = {
  CA:  { actionType: 'PULL',     writtenBy: 'pulled' },
  CF:  { actionType: 'PULL',     writtenBy: 'pulled' },
  FP:  { actionType: 'PULL',     writtenBy: 'pulled' },
  RP:  { actionType: 'PUT',      writtenBy: 'putCompleted (SDP)' },
  HP:  { actionType: 'PUT',      writtenBy: 'putCompleted (MNP)' },
  GPM: { actionType: 'STAGE',    writtenBy: 'staged' },
  CON: { actionType: 'CONSOLID', writtenBy: 'consolidated' },
};

export const IRP_FUNCTION_CODES = Object.keys(IRP_FUNCTION_SOURCES) as IrpFunctionCode[];

/** Fields every event carries; the constructor adds actionType + functionCode. */
type EventBase = Omit<LogEntry, 'actionType' | 'functionCode'>;

/**
 * A put completed. SDP (System Directed Put) is a Rack Put → `RP`; MNP (Manual Put) is a
 * Hand Put → `HP`.
 */
export function putCompleted(method: 'SDP' | 'MNP', base: EventBase): LogEntry {
  return { ...base, actionType: 'PUT', functionCode: method === 'SDP' ? 'RP' : 'HP' };
}

/** A pallet was consolidated into an occupant (MNP) → `CON`. */
export function consolidated(base: EventBase): LogEntry {
  return { ...base, actionType: 'CONSOLID', functionCode: 'CON' };
}

/** A GPM staged one location (STG Stage) → `GPM`. */
export function staged(base: EventBase): LogEntry {
  return { ...base, actionType: 'STAGE', functionCode: 'GPM' };
}

/**
 * A location re-staged by an STG mass restage. Same `STAGE` actionType (SAR's "Staged
 * Longest" reads every STAGE row), but deliberately **no** functionCode: IRP's GPM Staging
 * "explicitly excludes mass-staging from a Stage Aisle (STG) restage operation"
 * (DevNotes/DesignPrompts/IRP.md; confirmed by direct instruction 2026-11-15).
 */
export function restaged(base: EventBase): LogEntry {
  return { ...base, actionType: 'STAGE' };
}

/** A container was pulled (PIP verify) → its pull function's code (CA/CF/FP; BK passes
 *  through for completeness though nothing produces a real BK pull today). */
export function pulled(pullFunction: string, base: EventBase): LogEntry {
  return { ...base, actionType: 'PULL', functionCode: pullFunction };
}
