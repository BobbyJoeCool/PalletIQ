// Shared cross-cutting TypeScript types consumed by both src/ and api/.

// ─── String unions (enum equivalents for SQL Server) ─────────────────────────

export type Role = 'ADMIN' | 'MANAGER' | 'LEAD' | 'IM' | 'WORKER';

export type LocationStatus =
  | 'HOLD_IN'
  | 'HOLD_OUT'
  | 'HOLD_BOTH'
  | 'HOLD_PERM'
  | 'EMPTY'
  | 'STORED'
  | 'PULL_PENDING'
  | 'RESERVED'
  | 'STAGED';

export type LocationSize = 'XS' | 'HS' | 'S' | 'M' | 'L';

export type PalletStatus =
  | 'PUT_PENDING'
  | 'STORED'
  | 'PULL_PENDING'
  | 'PULLED'
  | 'CANCELED';

export type LabelStatus =
  | 'AVAILABLE'
  | 'PRINTED'
  | 'PULLED'
  | 'DIVERTED'
  | 'CANCELED'
  | 'PURGED';

export type ActionType = 'PULL' | 'PUT';

// ─── Lookup tables ───────────────────────────────────────────────────────────

export interface StorageCode {
  id: string;
  desc: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface HoldType {
  code: string;
  desc: string;
}

export interface PackingZone {
  id: number;
  desc: string;
}

export interface Store {
  id: number;
  name: string;
}

// ─── Core models ─────────────────────────────────────────────────────────────

export interface Item {
  dept: number;
  class: number;
  item: number;
  upc: string;
  name: string;
  desc: string;
  descShort: string;
  retailPrice: number;
  cost: number;
  packingZoneCode: number;
  storageCode: string;
  conveyable: boolean;
}

export interface Location {
  aisle: number;
  bin: number;
  level: number;
  zone: number;
  status: LocationStatus;
  holdTypeCode: string | null;
  storageCode: string;
  size: LocationSize;
}

export interface User {
  zNumber: string;
  firstName: string;
  lastName: string;
  role: Role;
  departmentId: string;
  // pinHash intentionally omitted — never sent to client
}

export interface Pallet {
  pid: number;
  dept: number;
  class: number;
  item: number;
  receivedPallets: number;
  currentPallets: number;
  receivedCartons: number;
  currentCartons: number;
  receivedSSPs: number;
  currentSSPs: number;
  vcp: number;
  ssp: number;
  status: PalletStatus;
  locationAisle: number | null;
  locationBin: number | null;
  locationLevel: number | null;
  receivedByZ: string;
  receivedAt: string;
  putByZ: string | null;
  putAt: string | null;
  lastPulledByZ: string | null;
  lastPulledAt: string | null;
}

export interface Label {
  lid: string;
  pid: number;
  dept: number;
  class: number;
  item: number;
  quantity: number;
  sspQuantity: number;
  batchDate: number;
  purgeDate: string;
  destinationStore: number;
  status: LabelStatus;
}

export interface ActivityLog {
  id: number;
  timestamp: string;
  userId: string;
  actionType: ActionType;
  palletId: number | null;
  locationAisle: number | null;
  locationBin: number | null;
  locationLevel: number | null;
  dept: number | null;
  class: number | null;
  item: number | null;
  details: string | null;
}
