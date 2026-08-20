# Screen Design: CII — Container ID Inquiry

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk)
**Bucket:** Existing Warehouse App (new screen, v1.8.9)
**Roles:** All roles can look up any container type. Action buttons (Cancel, Force Close, Reopen, Reassign) require IM+ role.

## Container Types

CII handles five container types, identified by a 2-digit CID prefix:

| Prefix | Type | Label |
|--------|------|-------|
| 91 | Full Case | Full Case |
| 92 | Overpack | Overpack Carton |
| 93 | SSP Pull Master | SSP Pull Master |
| 94 | SSP Unit | SSP Unit |
| 95 | Stray Each | Stray Each |

CIDs can be entered in compressed form (type-specific shorter length) or full 35-digit canonical form. The `expandCid()` utility normalizes both to canonical before API lookup.

## Flow

1. Worker arrives at `/container` via Home, HotJump ("CII"), or by tapping a container CID link on another screen.
   - 1a. If a container was already loaded earlier in this session (`CIIContext`/`CIIProvider`), the screen starts in the Loaded state showing that container.
2. The Container ID field is the only entry field. No persistent numpad — the numpad opens on field focus and dismisses on blur/lookup.
3. Worker scans a container barcode or types a CID and confirms.
4. `GET /api/containers/inquiry/{cid}` is called with the expanded canonical CID.
   - 4a. **Found:** the container loads into the Loaded state; the type-specific detail component renders in the left column and the event log renders in the right column.
   - 4b. **Not found:** error tone, `"Container not found"`, red wash on field.
5. In the Loaded state, the header shows the CID field (still live for re-scan), the type label, and a status badge.
6. Worker may re-scan/re-type at any time to load a different container without navigating away.

### Cross-Screen Navigation

Tappable links within detail views navigate to related screens:
- **Pallet ID** → `/pallet?pid={pid}` (PII)
- **DPCI** → `/item?dpci={dpci}` (IID)
- **Location** → `/location?loc={aisle}{bin}{level}` (LII)
- **Child/Source CID** → reloads CII with that CID (in-screen navigation)

## Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ Back   ⌂ Home   >_ Jump   ☰ Activity   CONTAINER ID INQUIRY    J. Smith  Logout │  104px Header
├──────────────────────────────────────────────────────────────────────────────┤
│                              (Message Bar — success/error text)                │  74px
├──────────────────────────────────────────────────────────────────────────────┤
│  CONTAINER ID  ┌──────────────┐   [Full Case]  [● AVAILABLE]               │
│                └──────────────┘                                              │
├──────────────────────────────────────┬───────────────────────────────────────┤
│  Type-Specific Detail               │  Event Log (380px)                    │
│  ────────────────────                │  ─────────                            │
│  Status: ● AVAILABLE                │  CREATED   by z001p2F                 │
│  Pull Function: CA                  │  2026-08-20 09:15:00                  │
│  DPCI: 012-03-0045  [link]          │                                       │
│  Item: Widget Description           │  PRINTED   by z002p2A                 │
│  Storage Code: DY                   │  2026-08-20 10:30:00                  │
│  Qty: Cartons: 4                    │                                       │
│  Qty: SSPs: 0                       │                                       │
│  Batch Date: 2026200                │                                       │
│  Destination: Store #1234           │                                       │
│  Pallet ID: 12345678  [link]        │                                       │
│  Location: 001-002-01  [link]       │                                       │
│                                      │                                       │
│  [Cancel Container]  (IM+ only)     │                                       │
└──────────────────────────────────────┴───────────────────────────────────────┘
│                                    Footer                                     │  54px
└──────────────────────────────────────────────────────────────────────────────┘
```

## Type-Specific Detail Views

### Full Case (91)

**Fields:** Status (badge), Pull Function, DPCI (tappable→IID), Item Description, Storage Code, Qty: Cartons, Qty: SSPs, Batch Date, Destination Store, Pallet ID (tappable→PII), Pallet Status (badge), Location (tappable→LII, if exists).

**Actions (IM+):**
- **Cancel Container** — visible when status is AVAILABLE or VERIFIED. Opens CIICancelModal with domain `CONTAINER_CANCEL`.

### Overpack (92)

**Fields:** Status (OPEN/CLOSED badge), Destination Store, Created At, Purge Date, Purged At, Closed By, Closed At, Contents list (child CIDs with type and addedAt, each tappable→CII).

**Actions (IM+):**
- **Force Close** — visible when open and not purged. Opens CIIOverpackActionModal (action=FORCE_CLOSE) with domain `OVERPACK_STATUS`.
- **Reopen** — visible when closed and not purged. Opens CIIOverpackActionModal (action=REOPEN) with domain `OVERPACK_STATUS`.

### SSP Pull Master (93)

**Fields:** Same as Full Case (Status, Pull Function, DPCI, Item, Storage Code, Quantities, Destination, Pallet, Location) plus SSP Units children list with CID (tappable→CII), status badge, and actual each qty.

**Actions (IM+):**
- **Cancel Container (Cascade)** — visible when not PACKED, CANCELED, or PURGED. Opens CIICancelModal with cascade count (number of PENDING children). Cascading cancel sets all PENDING child SSP Units to CANCELED via ContainerCancelEvent.

### SSP Unit (94)

**Fields (read-only):** Status, DPCI (tappable→IID), Standard Each Qty, Actual Each Qty, Destination Store, Created At, Packed At, Canceled At, Source Master CID (tappable→CII) with status and pid.

**Actions:** None — SSP Units are read-only on this screen.

### Stray Each (95)

**Fields:** Status (badge), DPCI (tappable→IID), Each Qty, Destination Store, Found By, Created At, Packed At, Canceled At.

**Actions (IM+):**
- **Reassign Destination** — visible when status is PENDING. Opens CIIReassignModal: store selector (filtered to exclude current store), ReasonCodeField (domain=`STRAY_REASSIGN`), optional note. POSTs to `/api/stray-eaches/{cid}/reassign`.

## Event Log

The right column (380px wide) renders a chronological event log fetched from `GET /api/containers/{cid}/events`. Events are merged from all per-type event tables (ContainerEvent, OverpackStatusEvent, OverpackPlacementEvent, SSPUnitAdjustmentEvent, StrayEachReassignmentEvent, ContainerCancelEvent) and sorted by timestamp descending.

Each entry shows:
- Event type (uppercase, underscores replaced with spaces)
- User name (if available)
- Timestamp (localized)
- Reason code + note (if present)
- Child CID link (if present, tappable→CII)
- Store change (previous → new, if present)
- Quantity change (previous → new, if present)

## Action Modals

All action modals share a consistent pattern:
- Full-screen overlay with centered card (460px wide)
- `ReasonCodeField` with the appropriate domain
- Optional reason note text input (max 255 chars)
- Confirm button (disabled until reason code selected, shows submitting state)
- Back button to dismiss
- On success: success message via MessageBar, modal closes, container data refreshes
- On failure: error message via MessageBar

## API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/containers/inquiry/{cid}` | Any | Type-aware lookup returning discriminated response |
| GET | `/api/containers/{cid}/events` | Any | Merged event log from all per-type event tables |
| POST | `/api/containers/{cid}/cancel` | IM+ | Cancel Full Case or SSP Master (with cascade) |
| POST | `/api/overpacks/{cid}/force-close` | IM+ | Force close an open overpack |
| POST | `/api/overpacks/{cid}/reopen` | IM+ | Reopen a closed overpack |
| POST | `/api/stray-eaches/{cid}/reassign` | IM+ | Reassign stray each destination store |

## Data / Behind the Scenes

- **CID format:** 35-digit numeric with 2-digit type prefix. Compressed forms vary by type (Overpack=16 digits, Stray Each=27 digits, SSP Master=31 digits, Full Case/SSP Unit=35 digits). `shared/cidFormat.ts` handles expansion/compression.
- **Session persistence:** `CIIContext` (mounted in App.tsx) stores the last-loaded container data; survives navigation and restores on return.
- **Reason code domains:** Three CII-specific domains — `CONTAINER_CANCEL`, `OVERPACK_STATUS`, `STRAY_REASSIGN` — all 18 reason codes apply to all three.
- **Reason code validation:** All action endpoints validate reason codes server-side via `validateReasonCode()` with the appropriate domain.
- **Atomicity:** All action endpoints use `prisma.$transaction()` for atomicity.

## Demo Scanner

Container Demo Scanner Bar provides sample CIDs for each of the five container types.
