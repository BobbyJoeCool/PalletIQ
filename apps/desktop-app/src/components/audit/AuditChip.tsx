import { useEffect, useRef, useState } from 'react';
import type { AuditRef } from '@shared/audit';
import { attachAuditRefToDrag } from '../../lib/auditDrag';
import { AUDIT_TYPE_LABELS, displayRefId } from '../../lib/auditFormat';
import { AUDIT_PANE_COUNT } from '../../lib/useAuditPanes';

interface AuditChipProps {
  /** The record this chip points at. */
  target: AuditRef;
  /** Text shown on the chip; defaults to the identifier. */
  label?: string;
  /** Called when the user picks a pane from the chip's menu. */
  onSend: (paneIndex: number, target: AuditRef) => void;
}

/**
 * A cross-reference chip (#148): an identifier inside a summary or trail that can be
 * opened in any pane. Two ways to use it — drag it onto a pane, or click it and choose
 * "Open in Pane N" from the menu (the alternative for anyone who can't or doesn't want
 * to drag). The menu closes on choosing, on Escape, or on a click anywhere else.
 */
export function AuditChip({ target, label, onSend }: AuditChipProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  // While the menu is open, a click outside it or Escape closes it.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const text = label ?? displayRefId(target);
  const typeLabel = AUDIT_TYPE_LABELS[target.type];

  return (
    <span ref={containerRef} className="relative inline-block print:static">
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          attachAuditRefToDrag(event, target);
          setMenuOpen(false);
        }}
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={`${typeLabel} ${displayRefId(target)} — drag to a pane, or click to choose one`}
        className="cursor-grab rounded border border-[var(--info-border)] bg-[var(--info-bg)] px-1.5 py-px font-data text-xs text-[var(--info)] underline decoration-dotted underline-offset-2 hover:bg-[var(--surface-5)] active:cursor-grabbing print:border-0 print:bg-transparent print:p-0 print:no-underline"
      >
        {text}
      </button>

      {menuOpen && (
        <span
          role="menu"
          aria-label={`Open ${typeLabel} ${displayRefId(target)}`}
          className="absolute left-0 top-full z-30 mt-1 flex w-36 flex-col rounded-md border border-[var(--border-strong)] bg-[var(--surface-4)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)] print:hidden"
        >
          {Array.from({ length: AUDIT_PANE_COUNT }, (_, paneIndex) => (
            <button
              key={paneIndex}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onSend(paneIndex, target);
              }}
              className="px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-6)] hover:text-[var(--text-primary)]"
            >
              Open in Pane {paneIndex + 1}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
