import errorSound from '../assets/Error.mp3';
import infoSound from '../assets/Info.mp3';
import warningSound from '../assets/Warning.mp3';

export type AlertTone = 'error' | 'info' | 'warning';

/** Per-tone playback volume (0.0–1.0). Error is loudest, Info is quietest. */
const TONE_VOLUME: Record<AlertTone, number> = {
  error: 1.0,
  warning: 0.7,
  info: 0.5,
};

const TONE_SRC: Record<AlertTone, string> = {
  error: errorSound,
  warning: warningSound,
  info: infoSound,
};

/**
 * Plays an audio alert tone for the given severity level.
 *
 * @param tone - The tone to play: "error" for failures, "info" for success/informational,
 *   "warning" for non-blocking cautions (occupied location, already-stored pallet, etc.)
 */
export function playAlert(tone: AlertTone): void {
  const audio = new Audio(TONE_SRC[tone]);
  audio.volume = TONE_VOLUME[tone];
  void audio.play().catch(() => {
    // Autoplay can be blocked before the user has interacted with the page; ignore.
  });
}

/**
 * Legacy alias for `playAlert('error')`. Kept for callers that predate the AlertTone union type.
 * @deprecated Use `playAlert('error')` directly
 */
export function playErrorBeep(): void {
  playAlert('error');
}
