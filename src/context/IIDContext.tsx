import { createContext, useContext, useState } from 'react';

// Item.vcp/Item.ssp do not exist on the actual data model — VCP/SSP are set per-pallet
// at receiving time, not fixed at the item level. Mirrors IIDPage.tsx's own local
// ItemData shape exactly (kept here, not imported from the page, so this context has no
// dependency on the page module).
export interface IIDItemData {
  dept: number;
  class: number;
  item: number;
  dpci: string;
  upc: string;
  name: string;
  desc: string;
  descShort: string;
  retailPrice: number;
  cost: number;
  unitWeight: number | null;
  packingZoneCode: number;
  storageCode: string;
  conveyable: boolean;
}

interface IIDContextValue {
  /** The most recently loaded item, or null if none has been loaded this session yet. */
  item: IIDItemData | null;
  setItem: (i: IIDItemData | null) => void;
}

const IIDContext = createContext<IIDContextValue | null>(null);

/**
 * Session-level store for IID's "currently loaded item" (App-Wide screen-persistence
 * item, v1.7.0 — mirrors LIIContext's/PIIContext's/ISIContext's own per-screen pattern)
 * — mounted once inside the authenticated route tree (see App.tsx) so navigating away
 * from IID and back restores the last-loaded item instead of resetting to the empty
 * Ready state. State clears naturally on logout, since ProtectedRoute unmounts this
 * provider along with the rest of the authenticated tree when the session token is
 * cleared.
 */
export function IIDProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<IIDItemData | null>(null);
  return (
    <IIDContext.Provider value={{ item, setItem }}>
      {children}
    </IIDContext.Provider>
  );
}

/** Hook that returns the current IID context: the last-loaded item. Must be called inside an IIDProvider; throws if used outside. */
export function useIID(): IIDContextValue {
  const ctx = useContext(IIDContext);
  if (!ctx) throw new Error('useIID must be used inside IIDProvider');
  return ctx;
}
