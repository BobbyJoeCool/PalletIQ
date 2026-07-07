import { useEffect, useState } from 'react';

const CANVAS_WIDTH = 1366;
const CANVAS_HEIGHT = 1024;

/**
 * Every screen in this app is built as a fixed 1366×1024 canvas (iPad Pro landscape — see
 * outline.md's "Device target" and playwright.config.ts's viewport comment) using absolute
 * layouts and hardcoded pixel math (numpad/keyboard heights, content-slot offsets, etc.).
 * Rather than rewrite every screen to be fluid, this renders the whole app at that exact
 * canvas size and scales the canvas down (or up) with a CSS transform to fit whatever screen
 * it's actually running on — e.g. a regular iPad's smaller landscape resolution.
 *
 * `position: fixed` descendants stay contained to the canvas box rather than leaking out to
 * the real viewport, because a non-`none` `transform` on an ancestor makes it their containing
 * block (CSS spec) — so AppShell's `fixed inset-0` screens scale along with everything else.
 */
export function ScaleToFit({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    /** Recomputes the scale factor (and portrait rotation) that fits the fixed canvas inside the current viewport. */
    function recompute() {
      const isPortrait = window.innerHeight > window.innerWidth;
      setPortrait(isPortrait);
      // In portrait, the canvas is rotated 90° (see the transform below), which swaps its
      // on-screen bounding box to CANVAS_HEIGHT wide by CANVAS_WIDTH tall — so the fit math
      // swaps which canvas dimension is compared against which viewport dimension too. This
      // is a software stand-in for a true OS/browser orientation lock: iOS Safari doesn't
      // implement the Screen Orientation Lock API in a plain browser tab (bug report
      // V1.0.5, "App doesn't lock to landscape orientation on iPhone"), so there's no way to
      // stop the device itself from being held in portrait — this rotates the content to
      // read as landscape regardless of how the phone is physically held.
      setScale(
        isPortrait
          ? Math.min(window.innerWidth / CANVAS_HEIGHT, window.innerHeight / CANVAS_WIDTH)
          : Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT),
      );
    }
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <div
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: portrait ? `rotate(90deg) scale(${scale})` : `scale(${scale})`,
        }}
        className="relative shrink-0"
      >
        {children}
      </div>
    </div>
  );
}
