import { apiFetch } from './api';
import type { PalletStatus, ContainerStatus } from '@shared/index';

/** Sentinel guaranteed not to exist as a real pallet id — same numeric-not-found convention
 *  already used by PII/SDP/MNP's own prior demo buttons (PIP's compound-submit PID demo is
 *  a deliberate exception, see Feature-9-AppWide-Demo-Scanner.md's Implementation-detail
 *  resolutions — it keeps its own non-numeric sentinel, untouched by this registry). */
export const INVALID_PALLET_ID = '999999999';

/** Every `PalletStatus` value (see `shared/index.ts`), with a human-readable label — the
 *  Pallet ID Demo Scanner's Status dropdown. Needs no new backend status logic (Feature 9
 *  doc) — `samplePalletByStatus` already does an exact match against this same enum. */
export const PALLET_STATUS_OPTIONS: { value: PalletStatus; label: string }[] = [
  { value: 'PUT_PENDING', label: 'Put Pending' },
  { value: 'STORED', label: 'Stored' },
  { value: 'CA_PULL_PEND', label: 'CA Pull Pending' },
  { value: 'FP_PULL_PEND', label: 'FP Pull Pending' },
  { value: 'PULLED', label: 'Pulled' },
  { value: 'CANCELED', label: 'Canceled' },
  { value: 'CONSOLIDATED', label: 'Consolidated' },
];

/** Fetches any valid, unfiltered pallet id — the Demo Scanner's "Valid Pallet ID" button. */
export async function fetchValidPallet(token: string): Promise<number> {
  const { palletId } = await apiFetch<{ palletId: number }>('/api/demo/pallet', token);
  return palletId;
}

/** Fetches a pallet matching an exact status, optionally narrowed by Storage Code and/or
 *  Size (Phase 1's two filters — Zone/Aisle deferred to a later pass, per the design doc,
 *  for the by-status popup specifically), and optionally by `aisle` (direct instruction —
 *  SDP's own aisle-aware "Valid Pallet ID" button, see `fetchValidPalletForAisle` below;
 *  narrows to a pallet whose own Storage Code/Size matches one of that aisle's actually-
 *  eligible locations, not just any pallet carrying a Storage Code the aisle has somewhere). */
export async function fetchPalletByStatus(
  token: string,
  status: PalletStatus,
  storageCode?: string,
  size?: string,
  aisle?: string,
): Promise<number> {
  const params = new URLSearchParams({ status });
  if (storageCode) params.set('storageCode', storageCode);
  if (size) params.set('size', size);
  if (aisle) params.set('aisle', aisle);
  const { palletId } = await apiFetch<{ palletId: number }>(`/api/demo/pallet-status?${params.toString()}`, token);
  return palletId;
}

/** SDP's own aisle-aware "Valid Pallet ID" button (direct instruction) — a Put Pending
 *  pallet whose own Storage Code/Size will actually fit the current aisle, rather than the
 *  generic unfiltered `fetchValidPallet` every other Pallet ID field's "Valid" button uses. */
export async function fetchValidPalletForAisle(token: string, aisle: string): Promise<number> {
  return fetchPalletByStatus(token, 'PUT_PENDING', undefined, undefined, aisle);
}

// ── Location ID (Feature 9, Phase 2) ────────────────────────────────────────────

/** Sentinel guaranteed not to exist as a real location id — same "always-8-digit override"
 *  convention `LocationEntryFields` already treats as a full-barcode scan. */
export const INVALID_LOCATION_ID = '99999999';

export type LocationStatusFilter = 'any' | 'empty' | 'stored' | 'staged' | 'reserved' | 'pullPending';

/** Location ID Demo Scanner's Status dropdown — mutually-exclusive occupancy, defaults to
 *  "Any" like every other axis below (WLH's retired "Find Held/Available Location"
 *  buttons, folded into the Hold axis, never cared about occupancy at all — an "Any"
 *  default here is what lets the Hold axis alone reproduce that same status-agnostic
 *  query, rather than accidentally narrowing it to one occupancy status). */
export const LOCATION_STATUS_OPTIONS: { value: LocationStatusFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'empty', label: 'Empty' },
  { value: 'stored', label: 'Stored' },
  { value: 'staged', label: 'Staged' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'pullPending', label: 'Pull Pending' },
];

export type HoldFilter = 'any' | 'not' | 'any_hold' | 'in' | 'out' | 'both' | 'perm';

/** Hold dropdown — independent of Status (`Location.holdCategory`), defaults to "Any". */
export const HOLD_OPTIONS: { value: HoldFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'not', label: 'Not Held' },
  { value: 'any_hold', label: 'Hold Any' },
  { value: 'in', label: 'Hold In' },
  { value: 'out', label: 'Hold Out' },
  { value: 'both', label: 'Hold Both' },
  { value: 'perm', label: 'Hold Perm' },
];

export type ContractionFilter = 'any' | 'yes' | 'no';

/** Contraction tri-state — independent of Status, defaults to "Any". */
export const CONTRACTION_OPTIONS: { value: ContractionFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Contracted' },
  { value: 'no', label: 'Not Contracted' },
];

export type MultiOccupantFilter = 'any' | 'multi' | 'single';

/** Multi-Occupant tri-state — independent of Status, defaults to "Any". */
export const MULTI_OCCUPANT_OPTIONS: { value: MultiOccupantFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'multi', label: 'Multiple Pallets' },
  { value: 'single', label: 'Single Pallet or Empty' },
];

export interface LocationFetchResult {
  /** 6-digit zero-padded Aisle+Bin id. */
  locationId: string;
  /** Exact level of the picked row. */
  level: number;
}

/** Fetches any valid, unfiltered location — the Demo Scanner's "Valid Location" button. */
export async function fetchValidLocation(token: string): Promise<LocationFetchResult> {
  return apiFetch<LocationFetchResult>('/api/demo/location', token);
}

export interface LocationFilterParams {
  status: LocationStatusFilter;
  hold?: HoldFilter;
  contraction?: ContractionFilter;
  multiOccupant?: MultiOccupantFilter;
  storageCode?: string;
  size?: string;
  zone?: string;
  aisle?: string;
  level?: string;
}

/** Fetches a location matching the Location Demo Scanner's Filter popup — Status plus the
 *  three independent Hold/Contraction/Multi-Occupant axes, plus Storage Code/Size/Zone/
 *  Aisle/Level filters, all optional/combining via AND (Feature 9, Phase 2). */
export async function fetchLocationByFilter(token: string, f: LocationFilterParams): Promise<LocationFetchResult> {
  const params = new URLSearchParams();
  if (f.status !== 'any') params.set('status', f.status);
  if (f.hold && f.hold !== 'any') params.set('hold', f.hold);
  if (f.contraction && f.contraction !== 'any') params.set('contraction', f.contraction);
  if (f.multiOccupant && f.multiOccupant !== 'any') params.set('multiOccupant', f.multiOccupant);
  if (f.storageCode) params.set('storageCode', f.storageCode);
  if (f.size) params.set('size', f.size);
  if (f.zone) params.set('zone', f.zone);
  if (f.aisle) params.set('aisle', f.aisle);
  if (f.level) params.set('level', f.level);
  return apiFetch<LocationFetchResult>(`/api/demo/location?${params.toString()}`, token);
}

/** PAR's own "Wrong Storage Type" Location Demo Scanner option (direct instruction, cross-
 *  scan-type dependency — needs the already-resolved item's own Storage Code) — an EMPTY
 *  location whose Storage Code deliberately does *not* match, exercising the Storage-Code
 *  mismatch warn-then-allow flow on demand. */
export async function fetchWrongTypeLocation(token: string, itemStorageCode: string): Promise<LocationFetchResult> {
  const params = new URLSearchParams({ status: 'wrongType', storageCode: itemStorageCode });
  return apiFetch<LocationFetchResult>(`/api/demo/location?${params.toString()}`, token);
}

/** MNP's own "Consolidate" Location Demo Scanner option (cross-scan-type dependency —
 *  needs the already-scanned pallet's own id) — a location whose stored occupant shares
 *  the scanned pallet's DPCI, exercising manualConfirm's combine popup on demand. */
export async function fetchConsolidateLocation(token: string, scannedPalletId: number): Promise<LocationFetchResult> {
  const params = new URLSearchParams({ status: 'consolidate', palletId: String(scannedPalletId) });
  return apiFetch<LocationFetchResult>(`/api/demo/location?${params.toString()}`, token);
}

// ── Container ID (Feature 9, CID phase) ─────────────────────────────────────────

/** The three real pull functions a container can carry — PIP's own selector list, moved
 *  here (was PIPPage-local) since `ContainerDemoScannerBar`'s by-status popup needs the
 *  same list for its Pull Function filter dropdown. BK/BKP are out of scope — see
 *  `ScreenSpecs/IRP.md`'s "Bulk and Breakpack are UI-visible but functionally inert" note. */
export const PULL_FUNCTIONS: { code: string; desc: string }[] = [
  { code: 'CA', desc: 'Carton Air' },
  { code: 'CF', desc: 'Carton Floor' },
  { code: 'FP', desc: 'Full Pallet' },
];

/** Sentinel guaranteed not to exist as a real container id — matches the `INVALID-PID-000`
 *  convention, distinguished by its own CID-shaped prefix. */
export const INVALID_CONTAINER_ID = 'INVALID-CID-000';

/** Every `ContainerStatus` value (see `shared/index.ts`), with a human-readable label — the
 *  Container ID Demo Scanner's Status dropdown. Needs no new backend status logic —
 *  `sampleContainer` already does an exact match against this same enum. */
export const CONTAINER_STATUS_OPTIONS: { value: ContainerStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'PRINTED', label: 'Printed' },
  { value: 'PULLED', label: 'Pulled' },
  { value: 'DIVERTED', label: 'Diverted' },
  { value: 'CANCELED', label: 'Canceled' },
  { value: 'PURGED', label: 'Purged' },
];

/** Fetches a valid, PRINTED container id matching the given pull function — PIP always has
 *  a Pull Function selected and only accepts a container whose own `pullFunction` matches
 *  it, so (unlike Pallet ID's unfiltered "Valid" button) this filter isn't optional here. */
export async function fetchValidContainer(token: string, fn: string): Promise<string> {
  const { containerId } = await apiFetch<{ containerId: string }>(`/api/demo/container?fn=${fn}`, token);
  return containerId;
}

/** Fetches a container matching an exact status, optionally narrowed by Pull Function
 *  (the by-status popup's own two dropdowns) — replaces PIP's old dedicated "Invalid Label"
 *  picker (Wrong Function/Pulled/Canceled/Purged), each of which is now just a Status pick
 *  here, per the Core Concept section's already-settled "Invalid is strictly not-found" rule. */
export async function fetchContainerByStatus(token: string, status: ContainerStatus, fn?: string): Promise<string> {
  const params = new URLSearchParams({ status });
  if (fn) params.set('fn', fn);
  const { containerId } = await apiFetch<{ containerId: string }>(`/api/demo/container?${params.toString()}`, token);
  return containerId;
}

// ── DPCI / UPC (Feature 9, DPCI/UPC phase) ──────────────────────────────────────

/** Sentinel guaranteed not to exist as a real DPCI — matches the ad hoc `999-99-9999`
 *  value IID/ISI/PAR each independently hardcoded before this registry existed. */
export const INVALID_DPCI = '999-99-9999';

/** Sentinel guaranteed not to exist as a real UPC — matches the ad hoc `999999999999`
 *  value IID/ISI/PAR each independently hardcoded before this registry existed. */
export const INVALID_UPC = '999999999999';

export type ExpirationFilter = 'any' | 'yes' | 'no';

/** Requires-Expiration-Date tri-state (`Item.requiresExpirationDate`) — independent of
 *  Storage Code/Handling Code, defaults to "Any". */
export const EXPIRATION_OPTIONS: { value: ExpirationFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Requires Expiration' },
  { value: 'no', label: 'No Expiration Required' },
];

export type HandlingFilter = 'any' | 'conveyable' | 'nonConveyable';

/** Handling Code tri-state (`Item.conveyable`) — independent of the other two, defaults to
 *  "Any". "Handling Code" is the worker-facing name for this axis; the one real column
 *  behind it today is the boolean `conveyable` flag (confirmed against
 *  `api/prisma/schema.prisma` — no separate, richer "handling code" concept exists yet). */
export const HANDLING_OPTIONS: { value: HandlingFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'conveyable', label: 'Conveyable' },
  { value: 'nonConveyable', label: 'Non-Conveyable' },
];

export interface ItemFetchResult {
  dpci: string;
  upc: string;
}

/** Fetches any valid, unfiltered item's DPCI+UPC pair — the Demo Scanner's "Valid" button.
 *  Unlike Container ID's own "Valid" (which always filters by Pull Function, a mandatory
 *  screen context), DPCI/UPC has no equivalent required context — every consumer's plain
 *  "Valid" is a fully random pick, same shape as Pallet ID's own unfiltered default. */
export async function fetchValidItem(token: string): Promise<ItemFetchResult> {
  return apiFetch<ItemFetchResult>('/api/items/sample', token);
}

export interface ItemFilterParams {
  storageCode?: string;
  requiresExpirationDate?: ExpirationFilter;
  conveyable?: HandlingFilter;
}

/** Fetches an item matching the DPCI/UPC Demo Scanner's by-filter popup — Storage Code,
 *  Requires Expiration Date, and Handling Code, all optional/combining via AND (Feature 9,
 *  DPCI/UPC phase). No Status filter — `Item` has no status column (confirmed in the
 *  design doc rather than worked around), so this scan type's middle button is "by Filter"
 *  not "by Status", matching Location ID's own naming for the same reason (multiple
 *  independent filter axes, no single status concept). */
export async function fetchItemByFilter(token: string, f: ItemFilterParams): Promise<ItemFetchResult> {
  const params = new URLSearchParams();
  if (f.storageCode) params.set('storageCode', f.storageCode);
  if (f.requiresExpirationDate && f.requiresExpirationDate !== 'any') {
    params.set('requiresExpirationDate', f.requiresExpirationDate === 'yes' ? 'true' : 'false');
  }
  if (f.conveyable && f.conveyable !== 'any') {
    params.set('conveyable', f.conveyable === 'conveyable' ? 'true' : 'false');
  }
  return apiFetch<ItemFetchResult>(`/api/items/sample?${params.toString()}`, token);
}
