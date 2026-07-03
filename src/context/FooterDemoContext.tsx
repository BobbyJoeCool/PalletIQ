import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface FooterDemoContextValue {
  demoSlot: React.ReactNode;
  setDemoSlot: (content: React.ReactNode) => void;
  clearDemoSlot: () => void;
}

const FooterDemoContext = createContext<FooterDemoContextValue | null>(null);

/**
 * Provides a React node slot in the Footer that individual screens can populate
 * with demo-mode action buttons. The Footer reads demoSlot and renders it in the
 * area between the Keypad/Keyboard toggles and the live clock.
 *
 * Screens register their demo buttons via the useDemoSlot hook; the slot is automatically
 * cleared on screen unmount so no stale buttons appear on other screens.
 */
export function FooterDemoProvider({ children }: { children: React.ReactNode }) {
  const [demoSlot, setDemoSlotState] = useState<React.ReactNode>(null);

  const setDemoSlot = useCallback((content: React.ReactNode) => {
    setDemoSlotState(content);
  }, []);

  const clearDemoSlot = useCallback(() => {
    setDemoSlotState(null);
  }, []);

  // Memoized so consumers (via useContext) only re-render when demoSlot actually
  // changes — an inline object literal here would recreate the context value on
  // every FooterDemoProvider render, forcing every consumer to re-render too.
  const value = useMemo(
    () => ({ demoSlot, setDemoSlot, clearDemoSlot }),
    [demoSlot, setDemoSlot, clearDemoSlot],
  );

  return (
    <FooterDemoContext.Provider value={value}>
      {children}
    </FooterDemoContext.Provider>
  );
}

/**
 * Hook that provides direct access to the demo slot setter and clearer.
 * Use useDemoSlot() for the typical mount/unmount pattern.
 * Must be called inside a FooterDemoProvider; throws if used outside.
 */
export function useFooterDemo(): FooterDemoContextValue {
  const ctx = useContext(FooterDemoContext);
  if (!ctx) throw new Error('useFooterDemo must be used inside FooterDemoProvider');
  return ctx;
}

/**
 * Convenience hook that registers demo slot content when the calling screen mounts
 * and clears it when the screen unmounts. Pass null to skip registration (e.g. when
 * the content isn't ready yet — such as when the screen is still in a state where
 * no demo buttons are applicable).
 *
 * When content changes (e.g. the screen transitions between states and needs different
 * demo buttons), re-syncs the slot immediately.
 *
 * @param content - React node to display in the footer demo area, or null for no buttons
 */
export function useDemoSlot(content: React.ReactNode) {
  const { setDemoSlot, clearDemoSlot } = useFooterDemo();
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    setDemoSlot(contentRef.current);
    return () => { clearDemoSlot(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync when content changes (e.g. screen transitions between states).
  useEffect(() => {
    setDemoSlot(content);
  }, [content, setDemoSlot]);
}
