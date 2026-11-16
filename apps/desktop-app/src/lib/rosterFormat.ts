import type { Segment, TimeSpan } from '@shared/workforce';
import {
  ATTENDANCE_CODES,
  DOWNTIME_CODE,
  DOWNTIME_REASONS,
  TIME_OFF_CODE,
  WAREHOUSE_FUNCTIONS,
} from '@shared/workforce';

/** Presentation for Job/Function Assignment (#145): colours, labels, times, messages. Pure. */

/** Bar colour per function code; Downtime and time off have their own look. */
export const FUNCTION_COLORS: Record<string, string> = {
  CA: '#2F6FD6',
  CF: '#1E9E8F',
  FP: '#8A4FD6',
  BKP: '#D9822B',
  BK: '#9C6B3F',
  RP: '#3FA34D',
  HP: '#8DB33A',
  GPM: '#C84F8A',
  CON: '#2AA7C9',
  [DOWNTIME_CODE]: '#5A5A5A',
  [TIME_OFF_CODE]: '#3A2A00',
};

/** @returns the bar colour for a code (a neutral grey for anything unknown) */
export function colorFor(code: string): string {
  return FUNCTION_COLORS[code] ?? '#444444';
}

/** @returns the long name of a function code, Downtime or Time Off */
export function functionLabel(code: string): string {
  if (code === DOWNTIME_CODE) return 'Downtime';
  if (code === TIME_OFF_CODE) return 'Time Off';
  return WAREHOUSE_FUNCTIONS.find((f) => f.code === code)?.label ?? code;
}

/** @returns the label of a downtime reason or attendance code */
export function reasonLabel(functionCode: string, reasonCode: string | null): string {
  if (!reasonCode) return '';
  const list =
    functionCode === DOWNTIME_CODE
      ? DOWNTIME_REASONS
      : functionCode === TIME_OFF_CODE
        ? ATTENDANCE_CODES
        : [];
  return list.find((r) => r.code === reasonCode)?.label ?? reasonCode;
}

/** @returns what a section's bar says: the function code, or the reason code for Downtime / time off */
export function sectionText(s: Segment): string {
  if (s.functionCode === TIME_OFF_CODE) return s.reasonCode ?? 'OFF';
  if (s.functionCode === DOWNTIME_CODE) return `DTM ${s.reasonCode ?? ''}`.trim();
  return s.functionCode;
}

/** @returns an instant as "6:15a" / "12:00p" */
export function clockText(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'a' : 'p'}`;
}

/** @returns a span as "6:00a–4:00p" */
export function spanText(span: TimeSpan): string {
  return `${clockText(span.start)}–${clockText(span.end)}`;
}

/** @returns a full description of a section, for tooltips and the conflict list */
export function describeSection(s: Segment): string {
  const reason = reasonLabel(s.functionCode, s.reasonCode);
  const note = s.reasonText ? ` (${s.reasonText})` : '';
  return `${spanText(s)} ${functionLabel(s.functionCode)}${reason ? ` — ${reason}` : ''}${note}`;
}

/** Messages for the roster endpoints' error codes. */
export const ROSTER_ERRORS: Record<string, string> = {
  FORBIDDEN: 'Job/Function Assignment is limited to LWW, OM and System Admin.',
  NO_DESKTOP_ACCESS: 'This account does not have desktop access.',
  UNAUTHORIZED: 'Your session has ended. Sign in again.',
  SHIFT_NOT_ON_DATE: 'That shift does not run on the chosen date.',
  WORKER_NOT_FOUND: 'One of those team members is not in your department.',
  SEGMENT_INVALID_TIMES: 'A section must end after it starts.',
  SEGMENT_OUTSIDE_SHIFT: 'Assignments must stay inside the shift.',
  SEGMENTS_OVERLAP: 'Two sections overlap.',
  INVALID_FUNCTION: 'That function is not available for your department.',
  REASON_REQUIRED: 'Choose a reason.',
  REASON_TEXT_REQUIRED: 'Enter a note for Other.',
  REASON_TEXT_TOO_LONG: 'The note is too long (255 characters at most).',
  REASON_NOT_ALLOWED: 'Only Downtime and Time Off take a reason.',
  INVALID_INPUT: 'Some of the entries are not valid.',
};

/** @returns the message for an error thrown by the roster client */
export function rosterErrorText(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  return ROSTER_ERRORS[code] ?? 'The request failed. Check that the API is running and try again.';
}
