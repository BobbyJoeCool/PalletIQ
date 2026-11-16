// CID format parsing for the API layer. The format rules themselves live once in
// `shared/cidFormat.ts` (#217 — previously this file was a hand-maintained copy, since the
// API's tsconfig rootDir couldn't reach shared/). This module only adds the HTTP-error
// wrapper handlers want.

import { expandCid, extractCidFields, type CidFields, type CidTypeCode } from '../../shared/cidFormat.js';

export {
  CID_TYPE,
  CID_TYPE_LABELS,
  type CidTypeCode,
  type CidFields,
  expandCid,
  extractCidFields,
} from '../../shared/cidFormat.js';

export interface ParsedCid {
  canonical: string;
  type: CidTypeCode;
  fields: CidFields;
}

/**
 * Expands and parses a scanned/typed CID.
 * @throws 400 INVALID_CID_FORMAT when the input isn't a valid compressed or canonical CID
 */
export function parseCidOrThrow(input: string): ParsedCid {
  const canonical = expandCid(input);
  if (!canonical) throw Object.assign(new Error('INVALID_CID_FORMAT'), { status: 400 });
  const fields = extractCidFields(canonical)!;
  return { canonical, type: fields.type, fields };
}
