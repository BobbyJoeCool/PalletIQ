// CID format parsing for the API layer. Mirrors shared/cidFormat.ts's logic
// without importing from @shared/ (the API's tsconfig rootDir doesn't reach it).

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

const ZERO_FILLED_FIELDS: Record<CidTypeCode, readonly (keyof typeof FIELD)[]> = {
  '91': [],
  '92': ['DPCI', 'PALLET_ID', 'PACKING_ZONE'],
  '93': ['DEST_STORE'],
  '94': [],
  '95': ['PALLET_ID'],
};

function compressedLength(type: CidTypeCode): number {
  return CANONICAL_LENGTH - ZERO_FILLED_FIELDS[type].reduce((sum, f) => sum + FIELD[f].len, 0);
}

function resolveContainerType(prefix: string): CidTypeCode | null {
  return VALID_TYPE_CODES.has(prefix) ? (prefix as CidTypeCode) : null;
}

export function expandCid(input: string): string | null {
  if (!/^\d+$/.test(input)) return null;
  if (input.length < 2) return null;
  const type = resolveContainerType(input.slice(0, 2));
  if (!type) return null;
  if (input.length === CANONICAL_LENGTH) return input;
  if (input.length !== compressedLength(type)) return null;

  let result = input;
  for (const fieldName of ZERO_FILLED_FIELDS[type]) {
    const { start, len } = FIELD[fieldName];
    result = result.slice(0, start) + '0'.repeat(len) + result.slice(start);
  }
  return result;
}

export interface CidFields {
  type: CidTypeCode;
  destStore: number;
  dpci: { dept: number; class: number; item: number };
  palletId: number;
  cartonNumber: number;
  packingZone: number;
  batchDate: number;
}

export function extractCidFields(canonical: string): CidFields | null {
  const expanded = canonical.length === CANONICAL_LENGTH ? canonical : expandCid(canonical);
  if (!expanded) return null;

  const type = expanded.slice(FIELD.TYPE.start, FIELD.TYPE.start + FIELD.TYPE.len) as CidTypeCode;
  const dpciRaw = expanded.slice(FIELD.DPCI.start, FIELD.DPCI.start + FIELD.DPCI.len);

  return {
    type,
    destStore: Number(expanded.slice(FIELD.DEST_STORE.start, FIELD.DEST_STORE.start + FIELD.DEST_STORE.len)),
    dpci: {
      dept: Number(dpciRaw.slice(0, 3)),
      class: Number(dpciRaw.slice(3, 5)),
      item: Number(dpciRaw.slice(5, 9)),
    },
    palletId: Number(expanded.slice(FIELD.PALLET_ID.start, FIELD.PALLET_ID.start + FIELD.PALLET_ID.len)),
    cartonNumber: Number(expanded.slice(FIELD.CARTON_NUM.start, FIELD.CARTON_NUM.start + FIELD.CARTON_NUM.len)),
    packingZone: Number(expanded.slice(FIELD.PACKING_ZONE.start, FIELD.PACKING_ZONE.start + FIELD.PACKING_ZONE.len)),
    batchDate: Number(expanded.slice(FIELD.BATCH_DATE.start, FIELD.BATCH_DATE.start + FIELD.BATCH_DATE.len)),
  };
}

export interface ParsedCid {
  canonical: string;
  type: CidTypeCode;
  fields: CidFields;
}

export function parseCidOrThrow(input: string): ParsedCid {
  const canonical = expandCid(input);
  if (!canonical) throw Object.assign(new Error('INVALID_CID_FORMAT'), { status: 400 });
  const fields = extractCidFields(canonical)!;
  return { canonical, type: fields.type, fields };
}
