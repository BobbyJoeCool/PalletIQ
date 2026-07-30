import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

interface FooterDemoContextValue {
  demoSlot: React.ReactNode;
  registerDemoSlot: (id: string, content: React.ReactNode) => void;
}

const FooterDemoContext = createContext<FooterDemoContextValue | null>(null);

/**
 * Provides a React node slot in the Footer that individual screens/field components can
 * populate with demo-mode action buttons. The Footer reads demoSlot and renders it in the
 * area between the Keypad/Keyboard toggles and the live clock.
 *
 * **Keyed registration (Feature 9), not last-write-wins.** More than one caller can be
 * simultaneously *mounted* and calling `useDemoSlot` — a screen's own top-level call
 * (e.g. MNP's `pallet_scanned`-state Location buttons) plus a field component's internal
 * one (e.g. `PalletIdField`'s `demoScanner` opt-in) — even though the app's own
 * single-numpad-owner convention means only one is ever meaningfully *active* at a time.
 * A null registration (a caller with nothing to show right now) is *removed* from the
 * registry rather than overwriting the displayed slot with null — otherwise a caller whose
 * own content goes stale-null *after* another caller has already registered its real
 * content (a real, observed bug: MNP's own delayed re-focus off the Pallet ID field, once
 * it scans successfully, could fire its clearing effect in a later commit than the
 * screen's own `pallet_scanned` buttons registered in, silently blanking the footer) can
 * never clobber that other caller's still-current content. The displayed slot is the most
 * recently registered non-null entry.
 */
export function FooterDemoProvider({ children }: { children: React.ReactNode }) {
  const [registrations, setRegistrations] = useState<Map<string, React.ReactNode>>(new Map());

  /** Registers (or clears, via `content: null`) one caller's own footer demo content, keyed
   *  by that caller's own stable id — never touches any other caller's registration. */
  const registerDemoSlot = useCallback((id: string, content: React.ReactNode) => {
    setRegistrations((prev) => {
      if (content == null) {
        if (!prev.has(id)) return prev; // no-op — avoids an extra render for an already-clear caller
        const next = new Map(prev);
        next.delete(id);
        return next;
      }
      // Delete-then-set (rather than a plain overwriting set) so this id moves to the end
      // of the Map's iteration order — insertion order is what "most recently registered"
      // below relies on.
      const next = new Map(prev);
      next.delete(id);
      next.set(id, content);
      return next;
    });
  }, []);

  // The most recently registered non-null entry. In normal operation at most one entry
  // ever exists (only one field is truly focused/active at a time), so this only matters
  // during the brief window where two callers' registrations genuinely overlap.
  const demoSlot = useMemo(() => {
    const values = [...registrations.values()];
    return values.length > 0 ? values[values.length - 1] : null;
  }, [registrations]);

  // Memoized so consumers (via useContext) only re-render when demoSlot actually
  // changes — an inline object literal here would recreate the context value on
  // every FooterDemoProvider render, forcing every consumer to re-render too.
  const value = useMemo(
    () => ({ demoSlot, registerDemoSlot }),
    [demoSlot, registerDemoSlot],
  );

  return (
    <FooterDemoContext.Provider value={value}>
      {children}
    </FooterDemoContext.Provider>
  );
}

/**
 * Hook that provides direct access to the demo slot registration function.
 * Use useDemoSlot() for the typical mount/unmount pattern.
 * Must be called inside a FooterDemoProvider; throws if used outside.
 */
export function useFooterDemo(): FooterDemoContextValue {
  const ctx = useContext(FooterDemoContext);
  if (!ctx) throw new Error('useFooterDemo must be used inside FooterDemoProvider');
  return ctx;
}

/**
 * Convenience hook that registers demo slot content, keyed by this hook call's own stable
 * id (`useId()`), when the calling component mounts, and clears (unregisters) it on
 * unmount. Pass null to skip registration (e.g. when the content isn't ready yet — such as
 * when the screen is still in a state where no demo buttons are applicable).
 *
 * When content changes (e.g. the screen transitions between states and needs different
 * demo buttons), re-syncs the registration immediately. See `FooterDemoProvider`'s own doc
 * comment for why this is a keyed registration rather than a single shared value.
 *
 * @param content - React node to display in the footer demo area, or null for no buttons
 */
export function useDemoSlot(content: React.ReactNode) {
  const { registerDemoSlot } = useFooterDemo();
  const id = useId();
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    registerDemoSlot(id, contentRef.current);
    return () => { registerDemoSlot(id, null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync when content changes (e.g. screen transitions between states).
  useEffect(() => {
    registerDemoSlot(id, content);
  }, [id, content, registerDemoSlot]);
}
