# useAisleField

**Category:** shared hook
**File:** `apps/floor-app/src/lib/useAisleField.ts`

## What it is

Bare-Aisle-filter entry field (issue #161) — numpad-driven, 3-digit, with an internal
async existence-check replacing what ELA (2 instances) and WLH's Range mode independently
lacked entirely, and what SDP/STG's per-stack override each independently re-implemented
via `GET /api/locations/empty-by-zone` (a heavier zone-map endpoint reused purely for its
`NOT_FOUND` side effect, the actual payload thrown away). Switched those two onto the
purpose-built `GET /api/locations/aisle-exists` instead — confirmed against the backend
(`api/functions/locations.ts`) that `checkAisleExists`/`getLocationsEmptyByZone` check the
exact same condition (`prisma.location.{count,findMany}({where:{aisle}})`), so this is a
pure lightening, not a semantic change.

Mirrors `useUpcField`'s shape (issue #160) — same `fetch`/`onResolved`/`onNotFound`
contract, `invalid`/`loading` state owned internally, a `loadAisle` for populating-and-
checking in one call, and a `clear`.

**Not every bare-Aisle site in the app is a consumer.** ELZ's own existence check is
inseparable from a real narrowing fetch (`empty-by-zone`) it needs regardless of this hook
— switching it over would either lose the zone-map payload or cost a second, genuinely
redundant network call, so ELZ kept its own pre-existing pattern (just a markup-only
cosmetic pass onto the shared `NumpadFieldBox`). STG's per-stack override renders through
its own deliberately-distinct `PalletBox` chrome (pallet-slat visual, explicitly not one of
the generic shared field components) — this hook still owns its *validation*, just not its
rendering.

**Truncates a confirmed value longer than 3 digits to its leading 3 before checking** — a
full location barcode scanned into a bare Aisle box delivers a longer value than manual
typing can produce (same reasoning as `LocationEntryFields`' own 8-digit full-barcode
override). Previously only SDP defended against this explicitly; every consumer gets it
uniformly now.

**Also returns an aisle-wide freight-type/size breakdown (issue #166).** `aisle-exists` no
longer answers only "does this aisle exist" — it now also returns what's stored there: an
`AisleBreakdownEntry[]` (`{storageCode, size, empty, staged}`), aggregated across every zone
in the aisle, using the identical eligibility filter `getLocationsEmptyByZone` already
applies per-zone (excludes contraction, excludes any hold but `HOLD_OUT`, counts only
`EMPTY`/`STAGED`). This hook exposes it as a new `breakdown` output, populated on a
successful resolve and reset to `[]` on not-found/empty/`clear()`. A caller with no use for
it (ELA, WLH, STG's own two Aisle fields) simply never reads it — extending the single
shared `aisle-exists` response was chosen over a second opt-in endpoint/param specifically so
those callers pay no extra network cost either way. SDP is the first real consumer — see
Consumers below.

**`onConfirm` always fires, even for an intentional empty confirm** (backspace-to-empty +
an explicit OK) — found while migrating STG's per-stack override, whose own pre-existing
behavior commits an emptied override back to Master Control's value on confirm. An earlier
draft of this hook skipped `onConfirm` entirely for an empty value, which would have
silently broken that (and, less obviously, ELA's own "commit whatever was confirmed"
behavior for clearing a range end) — fixed before any screen shipped it. Only the async
existence check itself skips on an empty value; checking "does aisle `''` exist" is
meaningless, and an empty box isn't "invalid," just unset.

## Props / Hook API

Called as `useAisleField(opts)`:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fetch` | `(aisle: string) => Promise<{ exists: boolean; breakdown: AisleBreakdownEntry[] }>` | yes | Checks aisle existence and freight breakdown — every current caller wires `GET /api/locations/aisle-exists` |
| `onResolved` | `(aisle: string) => void` | no | Fires once the confirmed value is a real aisle |
| `onNotFound` | `(aisle: string) => void` | no | Fires once the confirmed value is NOT a real aisle (or the check itself failed) |
| `onConfirm` | `(aisle: string) => void` | no | Fires the instant a box confirms, before the async check settles — for a caller that advances focus regardless of validity (WLH's pre-existing "length drives advance" convention) or commits the raw value unconditionally (ELA, STG's per-stack override) |

## Output

Returns `{ field, invalid, loading, breakdown, focusField, loadAisle, clear }` —
`breakdown: AisleBreakdownEntry[]` is new (issue #166); the rest mirrors `useUpcField`'s
equivalent members.

## Data flow

No external `value`/`onChange` — this hook's own state is the source of truth for the
aisle itself, same as `useDpciFields`/`useUpcField`. A screen reads `field.value`/
`field.isActive` directly for rendering (via `NumpadFieldBox`, or a screen's own local box
wrapper built on it — or, for STG's per-stack override, its own distinct `PalletBox`), and
supplies `fetch`/`onResolved`/`onNotFound`/`onConfirm` to own what happens around the
check without owning the field wiring or the async check itself.

`invalid` only ever drives a visual wash + message-bar side effect — it never blocks a
value from being committed. Every consumer's `onConfirm` (or, for PAR-mirroring "still
useful as a filter" screens like ELA, no explicit block at all) commits the typed value
regardless of whether it turns out to be a real aisle, matching the existing app-wide
convention that "length/completion drives advance and commit; correctness is a separate
highlight."

## Consumers

- `ELAPage.tsx` — both Aisle Range fields (Start/End); previously unvalidated, this is a
  real new capability, not just a refactor
- `WLHPage.tsx` — Range mode's Aisle field; also previously unvalidated, also gates the
  "Review Hold" action now (`canReview`)
- `SDPPage.tsx` — the entry-state Aisle field; switched from `empty-by-zone` to
  `aisle-exists`; also the first consumer of `breakdown` (issue #169) — renders a compact,
  flat (non-zone-grouped) `ZoneCodeBadge` row beneath the Aisle field via
  `groupBreakdownByStorageCode`, the same column-by-Storage-Code layout ELZ/STG's Zone
  Summary panels use
- `STGPage.tsx` — Master Control's Aisle field (previously had **no** existence check at
  all, an inconsistency with the per-stack override's own check — fixed as part of this
  migration) and each stack's per-stack Aisle override (switched from `empty-by-zone` to
  `aisle-exists`)

`ELZPage.tsx` is deliberately **not** a consumer — see "What it is" above.

## Related

- [`useUpcField`](useUpcField.md) — the precedent this hook's shape mirrors
- [`LocationEntryFields`](LocationEntryFields.md) — the 3-box Aisle/Bin/Level chain this
  bare single-box field is explicitly *not* part of (issue #161's own scope note); its
  `checkAisle`/`checkAisleBin` props (issue #162) follow the same `fetch`/existence-check
  shape for PAR's own Aisle/Bin progressive check
- [`NumpadFieldBox`](NumpadFieldBox.md) — the shared box primitive most consumers render
  through directly or via a thin local wrapper
- [`ZoneCodeBadge`](ZoneCodeBadge.md) — renders each `breakdown` entry; SDP's usage
  (issue #169) is its first consumer outside ELZ/STG's own per-zone Zone Summary panels
