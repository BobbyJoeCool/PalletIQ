import { createContext, useContext, useState } from 'react';

interface ReasonCodeSessionContextValue {
  /** The currently-selected prefix letter, sticky across every ReasonCodeField for the
   *  rest of this login session — null until some field resolves an initial one. */
  selectedPrefix: string | null;
  setSelectedPrefix: (letter: string) => void;
}

const ReasonCodeSessionContext = createContext<ReasonCodeSessionContextValue | null>(null);

/**
 * Session-sticky reason-code prefix selection (issue #84). Once a worker changes the
 * department/role letter on any `ReasonCodeField`, every other `ReasonCodeField` for the
 * rest of this login session opens with that same letter pre-selected — it only resets on
 * the next login, since this provider unmounts with the rest of the authenticated route
 * tree on logout (same pattern as `MNPContext`/`PIIContext`/etc., mounted in `App.tsx`).
 */
export function ReasonCodeSessionProvider({ children }: { children: React.ReactNode }) {
  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);
  return (
    <ReasonCodeSessionContext.Provider value={{ selectedPrefix, setSelectedPrefix }}>
      {children}
    </ReasonCodeSessionContext.Provider>
  );
}

/** Hook that returns the reason-code session context. Must be called inside a
 *  ReasonCodeSessionProvider; throws if used outside. */
export function useReasonCodeSession(): ReasonCodeSessionContextValue {
  const ctx = useContext(ReasonCodeSessionContext);
  if (!ctx) throw new Error('useReasonCodeSession must be used inside ReasonCodeSessionProvider');
  return ctx;
}
