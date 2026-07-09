export interface EditReasonCode {
  code: string;
  desc: string;
}

// Flat list for now — not gated by module/role access (see issue #29's Warehousing/Inbound
// menu restructure, which would introduce that access model; revisit splitting these once
// it lands). Mirrors holdReasonCodes.ts's pattern: a dropdown of known codes plus an "Other"
// escape hatch for anything not covered.
export const EDIT_REASON_CODES: EditReasonCode[] = [
  { code: 'E01', desc: 'Damaged product' },
  { code: 'E02', desc: 'Mis-scan / mis-key correction' },
  { code: 'E03', desc: 'Relabel' },
  { code: 'E04', desc: 'Quantity correction' },
  { code: 'E05', desc: 'Quality issue' },
];
