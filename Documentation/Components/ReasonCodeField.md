# ReasonCodeField

**Category:** entry field
**File:** `apps/floor-app/src/components/shared/ReasonCodeField.tsx`

## What it is

Shared reason-code entry (issue #84 full redesign) — used everywhere a reason code appears:
`HoldPanel` (WLH's main screen, and reused verbatim as the inline quick-hold panel on
PIP/SDP/MNP), STG's location-suggestion reject dialog, MNP's own occupied-location "Place
Hold Both" confirmation, and PII's Edit Mode.

Three parts, not one flat entry: a department/role **prefix letter** selector (always
defaults to the worker's own home department once options load — 2026-08-03 follow-up,
direct instruction, superseding the original "only defaults when locked to one option"
behavior; locked/non-interactive if that's the worker's only accessible prefix, otherwise
a small dropdown, **session-sticky** across every `ReasonCodeField` for the rest of the
login session via `ReasonCodeSessionContext`), a 2-digit **reason number** entry with a
dropdown-helper popup (same `CodePickerField` pattern Storage Code/Size use, optionally
pre-filled via `defaultNumber`), and a read-only **resolved-description** display
underneath (e.g. "Warehouse — Empty Location").

Replaces the previous flat, hardcoded-list design (`holdReasonCodes.ts`/
`editReasonCodes.ts`, both deleted) entirely. That design let a worker type any 3-character
string and have it silently accepted — the underlying `CodePickerField` was never given
`strict`. This redesign fetches every option live per-user from the real database
(`GET /api/reason-codes`) and sets `strict` on both parts, so an unrecognized value is
rejected instead of committed.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `domain` | `'HOLD' \| 'PALLET_ADJUST'` | yes | — | Which feature this reason code is for — determines which reason numbers are offered (`ReasonCodeDomain`) |
| `value` | `string` | yes | — | The resolved combined code (e.g. `"W01"`), or `''` if none chosen yet |
| `onChange` | `(value: string) => void` | yes | — | Fires only once both a prefix and a number are known |
| `size` | `'compact' \| 'default'` | no | `'default'` | `compact` for denser forms (e.g. an already-a-popup confirm dialog) |
| `label` | `string` | no | `'Reason Code'` | Empty string omits the label entirely (PII's compact usage) |
| `disabled` | `boolean` | no | `false` | Disables both parts |
| `defaultNumber` | `string` | no | — | Pre-fills the reason number once a default prefix resolves and `value` is still empty (2026-08-03 follow-up). The prefix itself is never caller-supplied this way — it always resolves to the worker's own home/session-sticky department; only the number is screen-specific (e.g. PIP's quick-hold passes `'02'`/Incorrect Count, SDP's Hold Location passes `'70'`/Blocked Location via `HoldPanel`'s own `defaultReasonNumber` passthrough). Omit for a field with no sensible number default (WLH's plain Hold button, MNP's general Hold quick-action) |

## Output

Renders the prefix `CodePickerField` (maxLength 1, `panel="keyboard"`, `w-[140px]`/
`w-[100px]` compact — wider than a single letter needs for a better kiosk touch target, but
~20px narrower than the reason-number box beside it so it doesn't dominate the pair;
2026-08-03 direct instruction, after an initial ~3x-wider pass ran too big), the
reason-number `CodePickerField` (maxLength 2, `panel="numpad"`, `w-[160px]`/`w-[120px]`
compact), and the resolved-description line. Calls
`onChange` with the combined string (`combineReasonCode(prefix, number)`) whenever both
parts are set — including immediately once the default prefix (+ `defaultNumber`, if
supplied) auto-resolves, so the caller's own `value` state reflects the visible default
rather than lagging behind it. Also writes into `ReasonCodeSessionContext` on every prefix
change (including the auto-resolved default), independent of `onChange`.

## Data flow

**External contract is a single combined string** (`value`/`onChange`, e.g. `"W01"`) —
deliberately unchanged from the pre-redesign component, so every existing caller's own
`useState('')` needed no restructuring. Internally, `splitReasonCode`/`combineReasonCode`
(`apps/floor-app/src/lib/reasonCode.ts`) translate between that single string and the two
real parts. The two-part split only surfaces at the API boundary — every write path
(`placeHold`, `placeRangeHold`, `editPallet`) accepts `reasonPrefix`/`reasonNumber` as
separate body fields, validated server-side via `api/lib/reasonCodes.ts`'s
`validateReasonCode` (never trusting the client's own already-filtered dropdown).

Options come from `useReasonCodes(domain)` (`apps/floor-app/src/lib/useReasonCodes.ts`),
which fetches `GET /api/reason-codes?domain=X` — this is **not** a static reference list
like `useStorageCodes`' module-level cache; it's derived live per-user server-side
(department + cross-training + role), so it fetches fresh on every mount rather than
caching indefinitely.

## Consumers

- `HoldPanel.tsx` — `domain="HOLD"`; covers WLH, PIP/SDP/MNP's quick-hold modals, and SDP's
  Verify-Put "Hold Location." `HoldPanel` itself takes `defaultHoldType`/
  `defaultReasonNumber` props and passes the latter through as this component's
  `defaultNumber` — each caller supplies its own screen-appropriate default (or neither):
  PIP's quick-hold → `'02'` (Incorrect Count), SDP's Hold Location → `'70'` (Blocked
  Location), WLH's plain Hold button and MNP's general Hold quick-action → neither
  (worker picks fresh each time)
- `STGPage.tsx`'s `RejectHoldDialog` — `domain="HOLD"`, pre-filled `W70` (full `value`, not
  `defaultNumber` — this dialog hardcodes both parts rather than deriving the prefix from
  the worker's own department, since it's a location-suggestion-reject action tied to the
  Warehouse floor context, not the worker's own identity)
- `MNPPage.tsx`'s `OccupiedLocationDialog` — `domain="HOLD"`, pre-filled `W01` (same
  full-`value` reasoning as STG); this was the one real behavior change from before #84 —
  was a hardcoded, non-editable `'W04'` direct API send, now a pre-filled-but-editable step
  matching every other entry point
- `PIIPage.tsx` — `domain="PALLET_ADJUST"`, compact size, no label, no default number

## Related

- [`CodePickerField`](CodePickerField.md) — the underlying entry-with-dropdown-helper chrome
  both parts render through
- `ReasonCodeSessionContext` (`apps/floor-app/src/context/ReasonCodeSessionContext.tsx`) —
  the session-sticky prefix selection, mounted once in `App.tsx`'s authenticated tree
- `useReasonCodes` (`apps/floor-app/src/lib/useReasonCodes.ts`) — the live per-user data source
- `api/lib/reasonCodes.ts` — `getUserAccessiblePrefixes`/`getReasonCodesForDomain`/
  `validateReasonCode`, the shared backend logic this component's data and every write
  path's validation both funnel through
