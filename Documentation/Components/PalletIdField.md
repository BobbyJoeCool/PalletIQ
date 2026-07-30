# PalletIdField

**Category:** entry field
**File:** `apps/floor-app/src/components/shared/PalletIdField.tsx`

## What it is

Shared Pallet ID entry field (issue #78), numpad-driven with no fixed length (Pallet IDs
aren't a uniform length, unlike Storage Code/Zone). Built on `NumpadFieldBox` — the same
shared box primitive PIP/SDP/MNP's own local `FieldDisplay` wrappers already used, rather
than hand-rolling its own button markup.

**Rendering/markup only — issue #158's own scope decision.** Unlike Storage Code/Size,
none of this app's 4 consumer screens (PII, SDP, MNP, PIP) has a Pallet ID validity check
that exists independent of a larger compound operation:

- **PII**'s `GET /api/pallets/:id` is a genuine standalone lookup by value, but it also
  hydrates the whole screen's pallet data — real screen-orchestration logic, not a small
  reusable validity check like `useCodePickerField`'s list-membership test.
- **SDP**'s `POST /api/puts/directed` combines Pallet ID with Aisle and override fields;
  a failure can originate from any of them, not just a bad Pallet ID.
- **MNP**'s `POST /api/puts/manual/scan` and **PIP**'s `POST /api/pulls/verify` are each
  one piece of a compound submit (a scan-with-side-effects, a label+pullFunction-scoped
  verify).

So each screen still computes and passes its own `invalid`/error handling and owns its own
submit call — this component doesn't own an internal async lookup. It also doesn't wash by
default: MNP/PIP clear the field on error (no wash) while SDP keeps the value visible
washed, a genuine pre-existing per-screen UX difference this migration preserved exactly
rather than unifying.

**Feature 9, Phase 1 update — PII is no longer a consumer of this component.** PII's own
Pallet ID scan turned out to be a genuine "does this pallet exist, fetch its data" check
(not a compound submit like SDP/MNP/PIP), so it adopted a self-validating sibling hook,
[`usePalletIdField`](usePalletIdField.md), instead — rendering its own `NumpadFieldBox`
directly rather than this component. SDP and MNP stayed on this component (still a
compound submit) and additionally opted into `demoScanner` (see Props below). PIP stayed on
this component too but does **not** pass `demoScanner` — its own "valid" PID demo must
return the specific pallet tied to the currently-loaded label (`ld.pallet.id`), which the
generic Demo Scanner has no way to express, the same reasoning that already keeps PIP's UPC
field off `useUpcField`. See `DevNotes/DesignPrompts/Feature-9-AppWide-Demo-Scanner.md`'s
Implementation-detail resolutions for the full reasoning.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `string` | yes | — | |
| `onChange` | `(value: string) => void` | yes | — | Fires on commit (Enter/OK — no fixed-length auto-commit) |
| `size` | `'compact' \| 'default'` | no | `'default'` | `default` matches PII's original 64px box; `compact` is a smaller 52px preset (no current consumer) |
| `boxClass` | `string` | no | size preset | Overrides box height/padding/radius — SDP/MNP/PIP all use `h-[72px] px-5 rounded-[12px]`, matching their pre-existing `FieldDisplay` size, distinct from either built-in preset |
| `valueClass` | `string` | no | size preset | Overrides value text classes |
| `caretClass` | `string` | no | size preset | Overrides caret bar dimensions |
| `width` | `string` | no | size preset | Overrides wrapper width |
| `label` | `string` | no | `'Pallet ID'` | |
| `disabled` | `boolean` | no | `false` | |
| `invalid` | `boolean` | no | `false` | App-wide red-wash — caller-determined (not-found/canceled/pull-pending/etc.), same precedence as every other washed field |
| `onActiveChange` | `(active: boolean) => void` | no | — | Reactive focus-state callback (Feature 10, mirrors `onValidityChange`) — needed by PIP, whose footer demo-button routing depends on which of several fields currently has the numpad, and can no longer read `pidField.isActive` directly now that this field owns its own internal `useNumpadField` instance |
| `demoScanner` | `boolean` | no | `false` | Feature 9, Phase 1 — opt-in: the field internally registers the shared Pallet ID [`DemoScannerBar`](DemoScannerBar.md) into the footer demo slot whenever it's focused, filling results via `onChange`. Off by default so a screen with its own compound-submit demo buttons that don't fit the generic scanner (PIP — see "What it is" below) isn't forced into an undefined last-write-wins race between this field's own registration and its own screen-level one |
| `demoAisle` | `string` | no | — | Only meaningful when `demoScanner` is true — passed straight through to `DemoScannerBar`'s own `aisle` prop. SDP's own aisle-aware **Valid Pallet ID** (direct instruction); omitted by MNP (no aisle context) |

## Output

Renders a `NumpadFieldBox` (label above a bordered box, blinking caret when active, em-dash
placeholder when empty). Owns an internal `useNumpadField('numpad')` instance — the
external `value` prop is one-way synced in via `useEffect`; the box's actual displayed
value and active/caret state are this internal field's own.

## Data flow

`value`/`onChange` are the same controlled shape as `CodePickerField`. Unlike
`CodePickerField`, there's no internal computed `invalid` — validity here isn't a property
of the value in isolation (see "What it is" above), so `invalid` is purely caller-supplied.
An imperative `PalletIdFieldHandle.focus()` (via `ref`) lets a caller re-open the field for
another attempt after a failed submit, matching `CodePickerFieldHandle`'s same pattern —
every one of the 4 consumers needs this for their own retry/rescan flow.

## Consumers

- `SDPPage.tsx` — `boxClass`/`valueClass`/`caretClass` overrides (72px); `disabled` from
  `!aisleField.value.trim() || locked`; `invalid` from `handlePalletScan`'s catch block;
  `demoScanner` (Feature 9)
- `MNPPage.tsx` — same 72px overrides; `disabled` from `screenState !== 'ready'`; no
  `invalid` (this screen clears on error, never washes); `demoScanner` (Feature 9)
- `PIPPage.tsx` — same 72px overrides; `onActiveChange` feeds the footer demo-button
  routing; no `invalid` (clears and refocuses on error, never washes); no `demoScanner`
  (see Feature 9 note above)

PII no longer renders this component — see the Feature 9 note above; it uses
[`usePalletIdField`](usePalletIdField.md) instead.

## Related

- [`NumpadFieldBox`](NumpadFieldBox.md) — underlying shared box primitive
- [`CodePickerField`](CodePickerField.md) — the analogous popup-style field, for comparison
  on why this one doesn't own an internal validity check
- [`usePalletIdField`](usePalletIdField.md) — the self-validating sibling hook PII uses instead
- [`DemoScannerBar`](DemoScannerBar.md) — the Feature 9 Demo Scanner this field can
  optionally own via `demoScanner`
