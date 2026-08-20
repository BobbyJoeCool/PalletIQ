import { createContext, useContext, useState } from 'react';

/** Discriminated union covering all five CII inquiry results. The `type` field
 *  drives which detail sub-component CIIPage renders. */
export type CIIContainerData =
  | (CIIBaseData & { type: '91'; pullFunction: string; breakpackOrigin: boolean; batchDate: string | null; quantity: { pallets: number; cartons: number; ssps: number }; pallet: CIIPalletRef; location: CIILocation | null; children?: undefined })
  | (CIIBaseData & { type: '92'; open: boolean; purged: boolean; createdAt: string; purgeDate: string; purgedAt: string | null; closedByZ: string | null; closedAt: string | null; contents: CIIOverpackChild[] })
  | (CIIBaseData & { type: '93'; pullFunction: string; breakpackOrigin: boolean; batchDate: string | null; quantity: { pallets: number; cartons: number; ssps: number }; pallet: CIIPalletRef; location: CIILocation | null; children: CIISSPChild[] })
  | (CIIBaseData & { type: '94'; standardEachQty: number; actualEachQty: number; createdAt: string; packedAt: string | null; canceledAt: string | null; sourceMaster: { cid: string; status: string; pid: number } })
  | (CIIBaseData & { type: '95'; eachQty: number; foundByZ: string; createdAt: string; packedAt: string | null; canceledAt: string | null });

interface CIIBaseData {
  typeLabel: string;
  cid: string;
  status: string;
  dpci?: string;
  deptClassItem?: { dept: number; class: number; item: number };
  itemDesc?: string;
  itemName?: string;
  storageCode?: string;
  destinationStore: { id: number; name: string };
}

export interface CIIPalletRef {
  pid: number;
  status: string;
  quantity: { pallets: number; cartons: number; ssps: number };
}

export interface CIILocation {
  aisle: number;
  bin: number;
  level: number;
}

export interface CIIOverpackChild {
  childCid: string;
  childType: string;
  addedAt: string;
}

export interface CIISSPChild {
  cid: string;
  status: string;
  actualEachQty: number;
  destinationStore: number;
}

interface CIIContextValue {
  data: CIIContainerData | null;
  setData: (d: CIIContainerData | null) => void;
}

const CIICtx = createContext<CIIContextValue | null>(null);

export function CIIProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<CIIContainerData | null>(null);
  return (
    <CIICtx.Provider value={{ data, setData }}>
      {children}
    </CIICtx.Provider>
  );
}

export function useCII(): CIIContextValue {
  const ctx = useContext(CIICtx);
  if (!ctx) throw new Error('useCII must be used inside CIIProvider');
  return ctx;
}
