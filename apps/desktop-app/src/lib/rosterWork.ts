import type { Segment } from '@shared/workforce';
import { OTHER_REASON, reasonListFor } from '@shared/workforce';

/** The "what is this time" part of a timeline section (#145). */
export type Work = Pick<Segment, 'functionCode' | 'reasonCode' | 'reasonText'>;

/** @returns true when the work is complete: a function, and a reason / note where needed */
export function workIsComplete(work: Work): boolean {
  if (!work.functionCode) return false;
  const reasons = reasonListFor(work.functionCode);
  if (!reasons) return true;
  if (!work.reasonCode) return false;
  return work.reasonCode !== OTHER_REASON || Boolean(work.reasonText?.trim());
}
