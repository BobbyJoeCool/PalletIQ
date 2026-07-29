# vcpSspValidation

**Category:** shared validation (pure functions, not a hook or component)
**File:** `apps/floor-app/src/lib/vcpSspValidation.ts`

## What it is

The VCP/SSP/SSPs-on-Pallet cross-validated ratio rule, extracted (Feature 10, issue #164)
from PAR and PII, which independently implemented the identical business rules under two
different names (`checkVcpSsp`/`checkSspCap` in PAR, `vcpSspWarning` in PII).

**Deliberately pure functions, not a shared hook** — unlike
[`useExpirationDateFields`](useExpirationDateFields.md), PAR and PII's actual field-wiring
genuinely differs (PAR: raw `useNumpadField` chains with value-ref mirrors and multi-branch
screen-wide auto-advance across two entry modes/four fields; PII: `useEditField`'s own
commit-callback wrapper) in a way that doesn't collapse into one shared hook without
distorting one screen or the other. Only the validation *rule* was duplicated — each
screen keeps owning its own field wiring, wash rendering, and message-bar wording, and
calls into these functions for the check itself.

## Props / Hook API

Two plain functions:

### `checkVcpSspRatio(vcpStr: string, sspStr: string): VcpSspRatioResult`

| Return field | Type | Description |
| --- | --- | --- |
| `ratioInvalid` | `boolean` | True when SSP doesn't evenly divide VCP, or SSP is ≤ 0. Never true for incomplete input (either value not yet a valid integer) |
| `sspPerCarton` | `number \| null` | `VCP ÷ SSP`, only when the ratio is valid — feeds the cap check below and PAR's own "SSPs per Carton" display |

### `checkSspCap(sspPerCarton: number | null, looseSspsStr: string): boolean`

Returns `true` when the loose (non-full-carton) SSPs count is ≥ `sspPerCarton` — a full
carton's worth of "loose" SSPs should just be another whole carton. Takes `sspPerCarton`
directly (from `checkVcpSspRatio`'s own result) rather than re-deriving it, so a caller
with multiple loose-SSPs fields (PAR's Single-mode SSPs *and* Multiple-mode Partial SSPs)
only computes the ratio once.

## Output

No rendering, no side effects — pure computation. Each caller derives its own wash state
and message-bar text from the returned booleans.

## Data flow

Values in (as strings, matching how numpad fields hold them), booleans/derived numbers
out. Callers own: their own numpad/edit-field wiring, their own `invalid` state
(`useState`), and their own message-bar wording (PAR: `"SSPs must be less than a full
carton ({n} per carton)"`; PII: `"SSPs on Pallet must be less than a full carton (VCP ÷
SSP)"` — deliberately different text, not unified).

**Behavior note, found during migration**: PII's pre-extraction `vcpSspWarning` silently
returned "no warning" when SSP was ≤ 0 (an early-return guard), while PAR's own
`checkVcpSsp` already correctly flagged SSP ≤ 0 as invalid. The shared function follows
PAR's (more correct — division by zero/negative doesn't make sense) behavior; this is a
very minor, edge-case-only behavior change for PII, called out explicitly rather than
silently absorbed.

## Consumers

- `PARPage.tsx` — `runVcpSspCheck`/`runSspCapCheck` (local wrapper names, to avoid a
  naming collision with the imported functions) own PAR's state/message side effects
- `PIIPage.tsx` — `vcpSspWarning` (kept as PII's own local wrapper name/signature) now
  delegates to the shared functions internally

## Related

- [`useExpirationDateFields`](useExpirationDateFields.md) — the other #16x extraction,
  contrast in approach (shared hook vs. shared pure functions) explained above
