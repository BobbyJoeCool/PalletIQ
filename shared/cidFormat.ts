// CID (Container ID) format utilities — pure functions, no DB dependency.
// See DevNotes/DesignPrompts/CID-Format-Spec.md for the full specification.

// ─── Type Identifier Registry ────────────────────────────────────────────────

export const CID_TYPE = {
  FULL_CASE: '91',
  OVERPACK: '92',
  SSP_PULL_MASTER: '93',
  SSP_UNIT: '94',
  STRAY_EACH: '95',
} as const;

export type CidTypeCode = (typeof CID_TYPE)[keyof typeof CID_TYPE];

export const CID_TYPE_LABELS: Record<CidTypeCode, string> = {
  '91': 'Full Case',
  '92': 'Overpack',
  '93': 'SSP Pull Master',
  '94': 'SSP Unit',
  '95': 'Stray Each',
};

const VALID_TYPE_CODES = new Set<string>(Object.values(CID_TYPE));

// ─── Field positions in the canonical 35-digit form ──────────────────────────

const FIELD = {
  TYPE:         { start: 0,  len: 2  },
  DEST_STORE:   { start: 2,  len: 4  },
  DPCI:         { start: 6,  len: 9  },
  PALLET_ID:    { start: 15, len: 8  },
  CARTON_NUM:   { start: 23, len: 3  },
  PACKING_ZONE: { start: 26, len: 2  },
  BATCH_DATE:   { start: 28, len: 7  },
} as const;

const CANONICAL_LENGTH = 35;

// Per-type compression: which fields are zero-filled and omitted from the
// compressed (printed/scanned) form. Order matters — fields are listed in
// positional order so expansion can re-insert them left-to-right.
const ZERO_FILLED_FIELDS: Record<CidTypeCode, readonly (keyof typeof FIELD)[]> = {
  '91': [],
  '92': ['DPCI', 'PALLET_ID', 'PACKING_ZONE'],
  '93': ['DEST_STORE'],
  '94': [],
  '95': ['PALLET_ID'],
};

function compressedLength(type: CidTypeCode): number {
  const omitted = ZERO_FILLED_FIELDS[type].reduce((sum, f) => sum + FIELD[f].len, 0);
  return CANONICAL_LENGTH - omitted;
}

// ─── Parsed CID fields ──────────────────────────────────────────────────────

export interface CidFields {
  type: CidTypeCode;
  destStore: number;
  dpci: { dept: number; class: number; item: number };
  palletId: number;
  cartonNumber: number;
  packingZone: number;
  batchDate: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Resolves a 2-digit type prefix to its container type code, or null if unknown. */
export function resolveContainerType(prefix: string): CidTypeCode | null {
  return VALID_TYPE_CODES.has(prefix) ? (prefix as CidTypeCode) : null;
}

/** Returns true if `input` is a syntactically valid CID (correct prefix, all
 *  digits, and correct length for either the compressed or canonical form). */
export function isValidCidFormat(input: string): boolean {
  if (!/^\d+$/.test(input)) return false;
  const prefix = input.slice(0, 2);
  const type = resolveContainerType(prefix);
  if (!type) return false;
  return input.length === CANONICAL_LENGTH || input.length === compressedLength(type);
}

/** Expands a compressed (printed) CID back to its canonical 35-digit form by
 *  re-inserting zero-filled segments. If the input is already 35 digits, it's
 *  returned as-is after validation. Returns null on invalid input. */
export function expandCid(input: string): string | null {
  if (!/^\d+$/.test(input)) return null;
  if (input.length < 2) return null;

  const prefix = input.slice(0, 2);
  const type = resolveContainerType(prefix);
  if (!type) return null;

  if (input.length === CANONICAL_LENGTH) return input;

  const expected = compressedLength(type);
  if (input.length !== expected) return null;

  // Re-insert zero-filled fields at their canonical positions.
  let result = input;
  for (const fieldName of ZERO_FILLED_FIELDS[type]) {
    const { start, len } = FIELD[fieldName];
    result = result.slice(0, start) + '0'.repeat(len) + result.slice(start);
  }
  return result;
}

/** Parses a canonical (35-digit) or compressed CID into its constituent fields.
 *  Returns null on invalid input. */
export function extractCidFields(input: string): CidFields | null {
  const canonical = expandCid(input);
  if (!canonical) return null;

  const type = canonical.slice(FIELD.TYPE.start, FIELD.TYPE.start + FIELD.TYPE.len) as CidTypeCode;
  const destStore = Number(canonical.slice(FIELD.DEST_STORE.start, FIELD.DEST_STORE.start + FIELD.DEST_STORE.len));
  const dpciRaw = canonical.slice(FIELD.DPCI.start, FIELD.DPCI.start + FIELD.DPCI.len);
  const palletId = Number(canonical.slice(FIELD.PALLET_ID.start, FIELD.PALLET_ID.start + FIELD.PALLET_ID.len));
  const cartonNumber = Number(canonical.slice(FIELD.CARTON_NUM.start, FIELD.CARTON_NUM.start + FIELD.CARTON_NUM.len));
  const packingZone = Number(canonical.slice(FIELD.PACKING_ZONE.start, FIELD.PACKING_ZONE.start + FIELD.PACKING_ZONE.len));
  const batchDate = Number(canonical.slice(FIELD.BATCH_DATE.start, FIELD.BATCH_DATE.start + FIELD.BATCH_DATE.len));

  return {
    type,
    destStore,
    dpci: {
      dept: Number(dpciRaw.slice(0, 3)),
      class: Number(dpciRaw.slice(3, 5)),
      item: Number(dpciRaw.slice(5, 9)),
    },
    palletId,
    cartonNumber,
    packingZone,
    batchDate,
  };
}

/** Compresses a canonical 35-digit CID to its printed form by stripping
 *  zero-filled segments. Types with no compression return the input unchanged. */
export function compressCid(canonical: string): string | null {
  if (canonical.length !== CANONICAL_LENGTH) return null;
  if (!/^\d+$/.test(canonical)) return null;

  const type = resolveContainerType(canonical.slice(0, 2));
  if (!type) return null;

  const zeroFields = ZERO_FILLED_FIELDS[type];
  if (zeroFields.length === 0) return canonical;

  // Strip zero-filled fields from right to left so earlier positions stay valid.
  let result = canonical;
  for (let i = zeroFields.length - 1; i >= 0; i--) {
    const { start, len } = FIELD[zeroFields[i]];
    result = result.slice(0, start) + result.slice(start + len);
  }
  return result;
}

/** Builds a canonical 35-digit CID from individual field values. */
export function buildCid(fields: {
  type: CidTypeCode;
  destStore: number;
  dept: number;
  class: number;
  item: number;
  palletId: number;
  cartonNumber: number;
  packingZone: number;
  batchDate: number;
}): string {
  return (
    fields.type +
    String(fields.destStore).padStart(4, '0') +
    String(fields.dept).padStart(3, '0') +
    String(fields.class).padStart(2, '0') +
    String(fields.item).padStart(4, '0') +
    String(fields.palletId).padStart(8, '0') +
    String(fields.cartonNumber).padStart(3, '0') +
    String(fields.packingZone).padStart(2, '0') +
    String(fields.batchDate).padStart(7, '0')
  );
}
