/** A combined reason code's two real parts (issue #84) — e.g. "W01" is prefix "W" + number "01". */
export interface SplitReasonCode {
  prefix: string;
  number: string;
}

/** Splits a combined reason code (e.g. "W01") into its prefix and number parts. */
export function splitReasonCode(value: string): SplitReasonCode {
  return { prefix: value.slice(0, 1), number: value.slice(1) };
}

/** Combines a prefix letter and reason number into one code string (e.g. "W" + "01" -> "W01"). */
export function combineReasonCode(prefix: string, number: string): string {
  return `${prefix}${number}`;
}
