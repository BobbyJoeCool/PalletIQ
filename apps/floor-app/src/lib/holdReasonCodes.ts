export interface HoldReasonCode {
  code: string;
  desc: string;
}

// Hard-coded per Phase 10.0's scaffolding step ("seed or hard-code the hold reason-code
// list"). Format matches the schema's HoldType comment (1-letter department + 2-digit
// reason) even though these are never written to Location.holdTypeCode — WLH.md states
// the reason code is only ever recorded in the ActivityLog, not stored as a column
// (see the schema comment on Location.holdTypeCode and phase-10 log).
export const HOLD_REASON_CODES: HoldReasonCode[] = [
  { code: 'B01', desc: 'Damaged product' },
  { code: 'B02', desc: 'Quality hold' },
  { code: 'B03', desc: 'Inventory discrepancy' },
  { code: 'B04', desc: 'Pending investigation' },
  // Added for STG's location suggestion reject/hold flow (issue #77) — the default reason
  // when a GPMer rejects a suggested location, e.g. because it's physically inaccessible.
  { code: 'B05', desc: 'Blocked' },
  { code: 'S01', desc: 'Safety concern' },
  { code: 'S02', desc: 'Recall' },
  { code: 'O01', desc: 'Other — see notes' },
  // W04 matches enums.mmd's documented Department+Code table (W = Warehousing, 04 = Empty
  // Location) exactly — used by MNP's occupied-location popup when a worker flags a
  // destination as physically empty despite its recorded STORED/STAGED status. Added as a
  // minimal, targeted fix rather than the larger app-wide Department+Code reconciliation
  // (see DevNotes/Fixes/ReasonCodes/01-department-code-reconciliation.md).
  { code: 'W04', desc: 'Empty location' },
];
