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

  useEffect(() => {
    /** Recomputes the scale factor that fits the fixed canvas inside the current viewport. */
    function recompute() {
      setScale(Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT));
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
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})` }}
        className="relative shrink-0"
      >
        {children}
      </div>
    </div>
  );
}
