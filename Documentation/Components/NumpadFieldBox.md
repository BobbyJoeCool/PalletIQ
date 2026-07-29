# NumpadFieldBox

**Category:** chrome wrapper
**File:** `apps/floor-app/src/components/shared/NumpadFieldBox.tsx`

## What it is

Shared "label above a bordered box, red border + blinking caret when active, optional
invalid-red wash" numpad-driven entry field — the pattern independently reinvented as
PIP/SDP/MNP's own local `FieldDisplay`, STG's Master Control `FieldDisplay`, PAR's
`FieldBox`, PII's `EditBox`, and WLH's `RangeNumBox` before this extraction (Refactoring
Audit finding F1, predates Feature 10). Owns the shared *behavior* (active/disabled/invalid
precedence, caret visibility, placeholder) so a future behavioral change only needs editing
here instead of in 7 files; every screen's box *dimensions* stay fully parameterized
(`boxClass`/`valueClass`/`caretClass`) rather than baked in, since every screen sized its
boxes slightly differently long before this extraction existed.

Purely presentational — no internal `useNumpadField` instance of its own. The caller
supplies `value`/`active`/`onFocus` from a `useNumpadField` (or equivalent) it owns itself.
This is the one difference from most Feature 10 entry fields (which own their internal
numpad field and take a controlled `value`/`onChange`): `NumpadFieldBox` is the lower-level
box primitive other fields (e.g. `PalletIdField`) build on top of, not itself a field with
opinions about commit semantics.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `string` | yes | — | Renders an em-dash placeholder when empty |
| `onFocus` | `() => void` | yes | — | Called on tap; caller should register its field's submit handler with the numpad |
| `label` | `string` | no | — | Whether this prop is *passed at all* (not just truthy) decides whether a wrapping div exists — omit entirely for a bare button with no wrapper (label shown elsewhere), pass `label=""` to keep the wrapper/width without visible text |
| `active` | `boolean` | no | `false` | Shows the blinking caret + red border |
| `disabled` | `boolean` | no | `false` | |
| `invalid` | `boolean` | no | `false` | App-wide red wash — wins over active, same precedence as every other washed field |
| `width` | `string` | no | — | Wrapping width class; applied to the label+box wrapper when a label is present, or directly to the box otherwise |
| `boxClass` | `string` | yes | — | Height/padding/corner-radius, e.g. `h-[72px] px-5 rounded-[12px]` — no default, every screen sizes differently |
| `valueClass` | `string` | yes | — | Value text classes, e.g. `text-[32px] font-medium tracking-[0.04em]` |
| `caretClass` | `string` | yes | — | Caret bar dimensions, e.g. `w-[3px] h-[38px]` |
| `labelClass` | `string` | no | `text-[14px]` | Label text size |
| `centered` | `boolean` | no | `false` | Centers value/caret/label — STG's Master Control and PII's Edit-mode boxes use this; every other screen left-aligns |

## Output

Renders a `<button>` (bare, or wrapped in a `<div>` with the label above it, per the
`label`-presence rule above) showing the current value or an em-dash placeholder, with a
blinking caret bar when `active`. No internal state — every visual input is a prop.

## Data flow

Fully controlled, no internal value ownership at all — the caller's own `useNumpadField`
(or a field component built on one, like `PalletIdField`) is the single source of truth for
`value`/`active`; this component only renders it.

## Consumers

Directly: `PIPPage.tsx`, `SDPPage.tsx`, `MNPPage.tsx` (each via a local `FieldDisplay`
wrapper), `STGPage.tsx` (Master Control), `PARPage.tsx` (`FieldBox`), `PIIPage.tsx`
(`EditBox`), `WLHPage.tsx` (`RangeNumBox`), plus `ELAPage.tsx`'s Aisle Range boxes directly.
Indirectly, as of Feature 10: [`PalletIdField`](PalletIdField.md).

## Related

- [`PalletIdField`](PalletIdField.md) — an entry field built on top of this primitive
- [`CodePickerField`](CodePickerField.md) — the popup-style sibling; hand-rolls similar
  markup rather than using this component, since it needs the dropdown-helper button beside
  the box that this component doesn't support
