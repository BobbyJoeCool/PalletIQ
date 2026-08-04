import { ReasonCodeField } from './ReasonCodeField';
import { ModalOverlay } from '../ui/ModalOverlay';

interface LockedHoldConfirmDialogProps {
  title: string;
  message?: string;
  /** The resolved combined reason code (e.g. "W01"), or '' if none chosen yet — same
   *  contract as `ReasonCodeField`'s own `value`. */
  value: string;
  onChange: (value: string) => void;
  /** Pre-fills the reason number once a default prefix resolves, leaving the prefix itself
   *  to default to the worker's own home department (SDP's Hold Location) — mutually
   *  exclusive with pre-filling `value` directly (MNP's occupied-location gate, which fixes
   *  both the prefix and number since "Empty Location" is a Warehouse-specific reason
   *  regardless of who's placing it). Only meaningful while `value` starts empty. */
  defaultNumber?: string;
  onConfirm: () => void;
  onBack: () => void;
  confirmLabel?: string;
  backLabel?: string;
  confirmDisabled?: boolean;
  width?: string;
  position?: 'center' | 'top' | 'left' | 'top-left';
}

/**
 * Confirms placing a single, non-selectable hold type with an editable Reason Code — the
 * shape shared by MNP's occupied-location gate ("Place Hold Both — Empty Location") and
 * SDP's Hold Location action ("Place Hold Both — Blocked Location", issue #84 follow-up,
 * direct instruction), both of which offer no Hold Type grid since the type is implied by
 * the situation that triggered the popup, unlike the full `HoldPanel`. Extracted once SDP
 * needed the identical shape a second time — was inline JSX only in MNP's
 * `OccupiedLocationDialog` before this (2026-08-03).
 *
 * Purely a confirm/back step — the actual `PATCH /api/locations/:id/hold` call and its
 * success/error handling stay with each caller, since what happens after (cancel a put vs.
 * clear a reservation vs. reset to entry) differs per screen.
 */
export function LockedHoldConfirmDialog({
  title, message, value, onChange, defaultNumber, onConfirm, onBack,
  confirmLabel = 'Confirm', backLabel = 'Back', confirmDisabled = false,
  width = 'w-[480px]', position = 'top',
}: LockedHoldConfirmDialogProps) {
  return (
    <ModalOverlay width={width} position={position}>
      <h2 className="font-ui text-[22px] font-semibold text-white text-center mb-3">{title}</h2>
      {message && (
        <p className="font-ui text-[15px] text-[#9A9A9A] text-center mb-5">{message}</p>
      )}
      <ReasonCodeField domain="HOLD" value={value} onChange={onChange} defaultNumber={defaultNumber} label="Reason" descriptionPosition="above" />
      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 h-[52px] rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] text-white hover:bg-[#1A1A1A] transition-colors"
        >
          {backLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="flex-1 h-[52px] rounded-[10px] font-ui text-[15px] font-semibold text-white bg-[#554400] hover:bg-[#665500] disabled:opacity-40 transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </ModalOverlay>
  );
}
