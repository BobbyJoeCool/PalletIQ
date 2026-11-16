# Screen Design: Location Setup (Desktop)

**Device:** DESKTOP — the Electron app in `apps/desktop-app/`, route `/screens/location-setup`
**Bucket:** DESKTOP / Manager
**Issue:** #143 · **Design source:** `DevNotes/DesignPrompts/Desktop/Location-Setup-Edit-design.md` (several decisions below replace it)

**Roles** (decided 2026-11-16; enforced by the API):

| Action | Who |
|---|---|
| View an aisle, change zone settings, contraction, mark a location Not For Storage | Every desktop user (LWW and up, plus ICQA) |
| Create or delete an aisle; restore a Not For Storage location | OM, Admin, or ICQA |

## Concepts

- **Four zones, always.** Each zone is a bin range covering both sides. By default (`BACK_TO_FRONT`, every existing aisle) Zone 1 holds the highest bins — the back of the aisle, where staging and putaway start. `FRONT_TO_BACK` puts Zone 1 at the lowest bins. The direction is stored and shown; STG/SDP/MNP do not read it yet.
- **Set up by zone.** Every location on one level of one zone-side (a *zone cell*) has the same storage code and size. There is no way to set those per location.
- **Not For Storage** (storage code `XO`) is the only per-location exception: a spot that is physically blocked (cage carts, end-of-aisle visibility, amnesty bin). It accepts no freight of any kind — puts, staging, reservations and reinstates are all refused, for every role. Its zone cell keeps the real storage code, which is what restoring the location puts back. On ELZ the zone cell still shows the zone's own code.
- **Contraction** is a separate tab. It can be set on whole zone cells or single locations, and is allowed on occupied locations: it only stops future puts.

## Flow

1. Choose an aisle from the picker. The aisle summary line shows its bins, sides and zone direction.
2. The grid shows one cell per zone cell: zones 1–4 left to right, each split Odd / Even; levels top-down. Each cell shows `storage code · size`.
3. **Selecting cells:** click one; drag for a rectangle; Shift-click for a range from the last click; Ctrl/Cmd-click to add or remove one; click a level heading (`L5`) or a side heading for the whole row or column; **All** selects everything. Selection is by cell index, like a spreadsheet.

### Zone Setup tab

1. With cells selected, choose a storage code and/or size (each starts at **NO CHANGE**) and **Apply**. Only the changed attributes are written, to the zone cells and every location in them. A Not For Storage location keeps `XO` but takes a new size.
2. If any affected location holds freight or is reserved, a confirmation lists them (up to ten) and says stored pallets keep their own storage code and size. **Apply anyway** proceeds.
3. Selecting exactly one cell lists its locations. An empty location (status EMPTY, no pallets) offers **Not For Storage…**: choose a reason — Cage Cart Storage, End of Aisle Visibility, Amnesty Bin, or Other (a note is then required). A carved-out location shows its reason and, for OM-level users, **Restore**.
4. The **Not For Storage** list shows every carve-out in the aisle with its reason; OM-level users can restore from it.

### Contraction tab

1. Cells are tinted by contraction: dark red when fully contracted, lighter when partly, with a count.
2. **All floor locations** selects level 1 of every zone-side. **All top locations** selects the top level of every zone-side — or its top three levels when that top level is Half Small or Extra Small. Each zone-side is worked out separately, since split and folded aisles top out at different levels.
3. **Contract** or **Open** applies to the selection. Selecting one cell lists its locations, each with its own Contract / Open.

### New aisle (OM-level)

1. Enter the aisle number, sides (both, odd only, even only), first and last bin (an aisle may start at any bin, e.g. 41), and zone direction.
2. The four zone ranges fill in as an even split — bins split in facing pairs on a double-sided aisle, any remainder going to the zones nearest Zone 1 — and can be edited. **Reset to even split** undoes edits; changing sides, bins or direction also resets them.
3. Set each side's levels (storage code and size per level; + Level copies the top level). For a zone whose levels differ from its side (e.g. aisle 730's 13-level Extra Small Zone 1), tick its **zone override** and set its own levels.
4. The preview grid and location count update live. The same validation the server runs decides whether **Create aisle** is enabled and shows the first problem.
5. Every location is created EMPTY. If the number belongs to a deleted aisle, that aisle's rows are reused (reset to EMPTY with the new settings).

### Delete aisle (OM-level)

Every location must be EMPTY and hold no pallets — a hard stop listing up to ten that are not. The aisle and its locations are soft-deleted: hidden from every floor function, history kept.

## Error handling

Each endpoint's error code has its own message (`apps/desktop-app/src/lib/locationSetupFormat.ts`). Notable: `OCCUPIED_CONFIRM_REQUIRED` (confirm step, not an error), `LOCATION_NOT_EMPTY` (carve-out of an occupied location), `AISLE_NOT_EMPTY`, `AISLE_EXISTS`, `FORBIDDEN` (role), and the definition errors (`ZONES_NOT_COVERING`, `LEVELS_NOT_CONTIGUOUS`, …).

## Data

| Endpoint | Does |
|---|---|
| `GET /api/aisles` | Live aisles for the picker |
| `GET /api/aisles/{aisle}` | Structure, zone cells with counts (locations, occupied, Not For Storage, contracted), carve-outs |
| `GET /api/aisles/{aisle}/locations?zone&side&level` | One zone cell's locations |
| `POST /api/aisles` | Create (OM-level); body is an `AisleDefinition` |
| `PATCH /api/aisles/{aisle}/zone-settings` | `{ cells, storageCode?, size?, confirmOccupied? }` |
| `PATCH /api/aisles/{aisle}/contraction` | `{ cells?, locations?, contracted }` |
| `DELETE /api/aisles/{aisle}` | Soft delete (OM-level) |
| `POST /api/locations/{id}/not-for-storage` | `{ reason, note? }` |
| `DELETE /api/locations/{id}/not-for-storage` | Restore (OM-level) |

**Tables:** `Aisle`, `AisleZone`, `AisleZoneSetting` (new); `Location.deleted`, `notForStorageReason`, `notForStorageNote` (new); storage code `XO` "Not For Storage". Existing aisles were backfilled from their locations by the migration.

**Activity log:** `AISLE_ADD`, `AISLE_DEL`, `ZONE_SET`, `CONTRACT`, `UNCONTRACT` (logged against the aisle), `XO_SET`, `XO_CLEAR` (logged against the location). They appear in the Audit Tool and, tagged `LSE`, in the floor app's activity overlay.

## Behind the Scenes

- **Rules in one place.** `shared/aisleSetup.ts` holds validation, the even zone split, expansion into locations, and the contraction presets. The API validates with it; the New Aisle preview uses the same functions.
- **Not For Storage in the location policy.** `shared/locationPolicy.ts` treats `XO` as never accepting inbound work; `whereAcceptsPut` excludes it (and deleted locations) from every put, stage, reservation and demo-sample query. `GET /api/storage-codes` leaves `XO` out, so no floor-app picker offers it.

## Differences from the design doc

- NOT FOR STORAGE is the `XO` storage code, not a separate flag.
- Zone count is fixed at 4; levels are set per side with per-zone overrides, not per side only.
- Structural edits after creation (bins, levels, zone boundaries, direction) are **not** in this version.
- Pickers are native selects (type-to-jump), not searchable comboboxes.
- No `SizeCode` table; the existing `Size` table is used.

## Open items still remaining

- Structural edits after creation.
- STG/SDP/MNP reading `zoneDirection`.
- Audit Tool location history does not yet separate a deleted-and-recreated aisle's earlier history (`Aisle.createdAt` marks the boundary).

## Change Log

- **2026-11-16:** first build (#143).
