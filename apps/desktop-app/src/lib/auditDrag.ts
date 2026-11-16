import type { DragEvent } from 'react';
import { isAuditEntityType } from '@shared/audit';
import type { AuditRef } from '@shared/audit';

/**
 * Drag-and-drop payload for Audit Tool cross-reference chips (#148): how a chip puts its
 * record on a drag, and how a pane recognises and reads one. Kept together so the format
 * has one writer and one reader.
 */

/** Payload type for a chip drag — private to this app, so nothing else can be dropped. */
const AUDIT_REF_MIME = 'application/x-palletiq-audit-ref';

/**
 * Attaches a cross-reference to a drag that is starting (mutates the event's dataTransfer).
 *
 * @param event - the chip's dragstart event
 * @param target - the record the chip points at
 */
export function attachAuditRefToDrag(event: DragEvent, target: AuditRef): void {
  event.dataTransfer.setData(AUDIT_REF_MIME, JSON.stringify(target));
  event.dataTransfer.effectAllowed = 'copy';
}

/**
 * @param event - a drag event over a pane
 * @returns true if what is being dragged is an Audit Tool chip
 */
export function isAuditRefDrag(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(AUDIT_REF_MIME);
}

/**
 * Reads the cross-reference out of a drop.
 *
 * @param event - the drop event
 * @returns the reference, or null if the drop was not a well-formed chip
 */
export function readAuditRefDrop(event: DragEvent): AuditRef | null {
  try {
    const parsed: unknown = JSON.parse(event.dataTransfer.getData(AUDIT_REF_MIME));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { type, id } = parsed as { type?: unknown; id?: unknown };
    return isAuditEntityType(type) && typeof id === 'string' ? { type, id } : null;
  } catch {
    return null;
  }
}
