import type { ReactNode } from 'react';

interface ModalOverlayProps {
  children: ReactNode;
  /** Extra classes on the backdrop itself, beyond the shared `absolute inset-0 bg-black/80
   *  flex items-center justify-center z-50` — e.g. the HoldPanel wrapper adds `p-8` so a
   *  tall scrollable card never touches the screen edge. */
  backdropClassName?: string;
  /** Card width class, e.g. `w-[480px]`. Omit for content-sized (the HoldPanel wrapper,
   *  which sizes to HoldPanel's own natural width instead of a fixed dialog width). */
  width?: string;
  /** Card padding class. Defaults to `p-8`, the value shared by every fixed-width dialog;
   *  the HoldPanel wrapper uses the tighter `p-6`. */
  padding?: string;
  /** Extra classes on the card itself — e.g. the HoldPanel wrapper adds `max-h-full
   *  overflow-y-auto` so tall content scrolls instead of overflowing the viewport. */
  cardClassName?: string;
  /** Card drop-shadow. Every fixed dialog uses `shadow-2xl`; the HoldPanel wrapper omits it. */
  shadow?: boolean;
  testId?: string;
}

/**
 * Shared full-screen modal backdrop + centered card chrome — the dark backdrop
 * (`bg-black/80`) and rounded/bordered card (`#0D0D0D` background) reinvented across
 * `ConfirmDialog` and 5 other sites before this extraction (Refactoring Audit finding
 * F3): MNP's `LevelModal`/`OccupiedLocationDialog`/`CombineDialog`, PIP's
 * `LevelCorrectionDialog`, and the identical one-off wrapper both screens built around
 * `<HoldPanel>`. Dialog-specific content (title, body, buttons) stays with each caller —
 * only the shared chrome is extracted here.
 */
export function ModalOverlay({
  children,
  backdropClassName = '',
  width = '',
  padding = 'p-8',
  cardClassName = '',
  shadow = true,
  testId,
}: ModalOverlayProps) {
  return (
    <div
      data-testid={testId}
      className={`absolute inset-0 bg-black/80 flex items-center justify-center z-50 ${backdropClassName}`}
    >
      <div className={`bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] ${padding} ${width} ${shadow ? 'shadow-2xl' : ''} ${cardClassName}`}>
        {children}
      </div>
    </div>
  );
}
