import type { ReactNode } from 'react';

interface ModalOverlayProps {
  children: ReactNode;
  /** Where the card sits within the backdrop (issue #84 follow-up, 2026-08-03, direct
   *  instruction). `'center'` (default) matches every dialog that predates this prop.
   *  `'top'` anchors the card near the top of the screen instead — for a dialog containing
   *  a field that opens the on-screen **Keyboard** (`HoldPanel`'s Reason Code prefix entry,
   *  a `ReasonCodeField`-based confirmation step), since Keyboard is full-width and 354px
   *  tall docked at the bottom — a centered card of typical height overlaps it. `'left'`
   *  anchors the card to the left side instead — for a dialog containing a field that opens
   *  the **Numpad** specifically (digit entry, e.g. SDP's Verify-Put Modal's Confirm
   *  Location boxes), since Numpad docks bottom-right (436px wide) and a wide centered card
   *  can extend under it. Both panels now render at `z-[60]`, above every modal, so this is
   *  purely a visual-overlap fix, not a click-reachability one — the panel was already
   *  clickable once the z-index fix landed; this just keeps the dialog's own content from
   *  being hidden underneath it. `'top-left'` combines both (2026-08-03 follow-up) — for a
   *  dialog whose content needs both panels (`HoldPanel`'s Reason Code entry uses both
   *  Keyboard for its prefix and Numpad for its number), anchored to the corner both
   *  panels leave clear rather than just one edge. */
  position?: 'center' | 'top' | 'left' | 'top-left';
  /** Extra classes on the backdrop itself, beyond the shared `absolute inset-0 bg-black/80
   *  flex ... z-50` — e.g. the HoldPanel wrapper adds `p-8` so a
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
const POSITION_CLASSES: Record<NonNullable<ModalOverlayProps['position']>, string> = {
  center: 'items-center justify-center',
  top: 'items-start justify-center pt-8',
  left: 'items-center justify-start pl-8',
  'top-left': 'items-start justify-start pt-8 pl-8',
};

export function ModalOverlay({
  children,
  position = 'center',
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
      className={`absolute inset-0 bg-black/80 flex ${POSITION_CLASSES[position]} z-50 ${backdropClassName}`}
    >
      <div className={`bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] ${padding} ${width} ${shadow ? 'shadow-2xl' : ''} ${cardClassName}`}>
        {children}
      </div>
    </div>
  );
}
