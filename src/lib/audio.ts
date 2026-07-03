export type AlertTone = 'error' | 'info' | 'warning';

/**
 * Plays an audio alert tone for the given severity level.
 * Currently a no-op stub — the real tone system (distinct error vs. informational tones)
 * is deferred to Phase 11.1 where actual audio clips or Web Audio API generation will be wired in.
 *
 * @param _tone - The tone to play: "error" for failures, "info" for success/informational,
 *   "warning" for non-blocking cautions (occupied location, already-stored pallet, etc.)
 */
export function playAlert(_tone: AlertTone): void {
  // intentional no-op — audio system to be designed separately
}

/**
 * Legacy alias for `playAlert('error')`. Kept for callers that predate the AlertTone union type.
 * @deprecated Use `playAlert('error')` directly
 */
export function playErrorBeep(): void {
  playAlert('error');
}
