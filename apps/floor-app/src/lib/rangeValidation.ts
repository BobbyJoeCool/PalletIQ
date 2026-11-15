/**
 * Pure start/end range check shared by PRQ's Aisle, Bin, and Carton-count range pairs
 * (PRQ.md: "if End is entered and is not greater than Start, show an error … Same error if
 * End is filled and Start is empty").
 *
 * Both values are raw field strings; a blank end is always valid (the range is optional /
 * open-ended). Non-numeric input is treated as invalid only when the end is non-blank.
 *
 * @param start - the range's start field value ('' when empty)
 * @param end - the range's end field value ('' when empty)
 * @param allowEqual - true accepts end === start (a single-value range); PRQ's Aisle/Bin
 *   pairs pass false per PRQ.md's strict "greater than"; the Carton-count pair passes true
 *   so an exact count can still be expressed as min = max
 * @returns true when the pair is acceptable
 */
export function isRangeEndValid(start: string, end: string, allowEqual: boolean): boolean {
  if (end.trim() === '') return true;
  if (start.trim() === '') return false;
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return allowEqual ? e >= s : e > s;
}
