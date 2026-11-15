/**
 * Field sequence (#214) — Tab, Back Tab and confirm-then-advance as moves along one
 * sequence: the enabled numpad/keyboard field boxes currently on screen, in document order,
 * scoped to the topmost open modal. Replaces the hand-written `useTabOrder` slot lists (12
 * pages, ~75 slots) that repeated each page's render conditions and read imperative refs
 * during render.
 *
 * Every field box marks itself with `fieldBoxAttrs(active)`. A field that isn't rendered
 * isn't in the DOM, so it's never in the sequence; a disabled or hidden box is skipped. A
 * move "activates" the next box by clicking it — the same path a worker's tap takes, so
 * each box's own focus handler (and its submit callback) runs unchanged.
 */

const FIELD_ATTR = 'data-numpad-field';
const ACTIVE_ATTR = 'data-field-active';
/** Marks a modal card as a sequence scope — Tab never leaves the topmost open modal. */
export const FIELD_SCOPE_ATTR = 'data-field-scope';

/** Props a field box spreads onto its clickable element. */
export function fieldBoxAttrs(active: boolean): Record<string, string | undefined> {
  return { [FIELD_ATTR]: '', [ACTIVE_ATTR]: active ? 'true' : undefined };
}

/** The element the sequence lives in: the last (topmost) open modal scope, else the page. */
function sequenceRoot(): ParentNode {
  const scopes = document.querySelectorAll(`[${FIELD_SCOPE_ATTR}]`);
  return scopes.length > 0 ? scopes[scopes.length - 1] : document;
}

/** Enabled, visible field boxes in document order. */
export function sequenceFields(): HTMLButtonElement[] {
  return Array.from(sequenceRoot().querySelectorAll<HTMLButtonElement>(`button[${FIELD_ATTR}]`))
    .filter((b) => !b.disabled && b.offsetParent !== null);
}

/**
 * Moves to the next/previous field, wrapping at both ends. With no field active, `next`
 * starts at the first field and `prev` at the last.
 * @returns true if a field was activated
 */
export function moveField(direction: 'next' | 'prev'): boolean {
  const fields = sequenceFields();
  if (fields.length === 0) return false;
  const current = fields.findIndex((b) => b.hasAttribute(ACTIVE_ATTR));
  if (current !== -1 && fields.length === 1) return false;
  const nextIndex = current === -1
    ? (direction === 'next' ? 0 : fields.length - 1)
    : (current + (direction === 'next' ? 1 : -1) + fields.length) % fields.length;
  fields[nextIndex].click();
  return true;
}

/**
 * Confirm-then-advance: activates the field after the one being confirmed, once React has
 * rendered whatever the confirm changed (a field that just became enabled or appeared must
 * be in the sequence before the move). The confirmed field is captured now, since the
 * confirm may close the panel before the move runs. Doesn't wrap — confirming the last
 * field ends the chain. Use where the next field in layout order is the intended target; a
 * deliberate jump elsewhere still focuses that field directly.
 */
export function advanceField(): void {
  const from = sequenceFields().find((b) => b.hasAttribute(ACTIVE_ATTR)) ?? null;
  setTimeout(() => {
    const fields = sequenceFields();
    const i = from ? fields.indexOf(from) : -1;
    if (i !== -1 && i + 1 < fields.length) fields[i + 1].click();
  }, 50);
}
