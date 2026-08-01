/**
 * Shared translucent-red "this field is wrong" background wash (v1.6.11, trialed on PAR
 * before wider rollout — see `DevNotes/DesignPrompts/Feature-8-AppWide-Invalid-Field-Wash.md`
 * for the full spec: individual-field vs. group-wash decision rule, reference usage, and
 * the app-wide rollout plan this constant's extraction is the first step of). Applies to
 * an invalid field's background instead of relying on a border alone, so it reads as
 * "wrong" even at a glance. Combine with `border-2 p-1 rounded-[10px]` on a wrapping `<div>`
 * for a group wash (several boxes washed together as one unit), or apply directly to a
 * single box's own border/background classes for an individual field wash.
 */
export const INVALID_WASH = 'bg-[#CC0000]/30 border-[#CC0000]';

/**
 * Shared translucent-blue "this field is confirmed valid" background wash (PIP #188 —
 * CID's 3-state valid/neutral/invalid status). 90%-transparent blue, mirroring
 * `INVALID_WASH`'s own construction — a solid border plus a low-opacity fill of the same
 * color, applied directly to a field's own border/background classes. Not a group-wash
 * variant (no `INVALID_WASH`-style "wrapping div" form) since every current consumer washes
 * a single box, not several as one unit.
 */
export const VALID_WASH = 'bg-[#3A6BB0]/10 border-[#3A6BB0]';
