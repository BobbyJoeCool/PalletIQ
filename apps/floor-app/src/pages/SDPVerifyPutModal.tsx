import { useState } from 'react';
import { DataRow } from '../components/shared/DataRow';
import { ItemDescription } from '../components/shared/ItemDescription';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { LockedHoldConfirmDialog } from '../components/shared/LockedHoldConfirmDialog';
import { StorageCodeBadge } from '../components/shared/StorageCodeBadge';
import { LiveId } from '../components/ui/LiveId';
import { ModalOverlay } from '../components/ui/ModalOverlay';
import { fmtLocation } from '../lib/fmt';
import type { ConsolidationCandidate } from '../lib/putsClient';
import type { PutView } from '../lib/usePutSession';

interface SDPVerifyPutModalProps {
  view: PutView;
  /** Exists Elsewhere candidates from the put session (server-filtered, current target
   *  already excluded). Empty for a Rack Put. */
  candidates: ConsolidationCandidate[];
  loading: boolean;
  locationEntryKey: number;
  onLocationConfirm: (value: string, wasScanned: boolean) => void;
  onLocationActiveChange: (active: boolean) => void;
  onUnassign: () => void;
  /** Places Hold Both on the reserved location; resolves true when it landed. */
  onHold: (reasonCode: string) => Promise<boolean>;
  /** Points the put at an Exists Elsewhere candidate (the reservation stays live). */
  onRedirect: (candidate: ConsolidationCandidate) => void;
  /** Points the put back at the reserved location. */
  onReturnToReserved: () => void;
}

/**
 * SDP's Verify-Put Modal (GitHub #151) — render-only since #215: the put session
 * (`usePutSession`) owns every call and rule, this component shows its `view` and raises
 * the worker's choices as callbacks. Two bodies — **Rack** (everything but XS) and
 * **Hand** (XS).
 *
 * Hold Location is always **Hold Both** with reason `70` (Blocked Location) pre-filled, via
 * the shared `LockedHoldConfirmDialog`; it stops once the hold is placed (no auto-continue).
 *
 * **Exists Elsewhere (Hand Put) is a redirect, not a shortcut confirm.** Picking a
 * candidate points the put at it; the worker still scans/types that location to confirm,
 * and the server completes it as a consolidation. The reservation stays live throughout,
 * so Unassign always releases it and Return to {reserved location} is always available
 * once review.
 */
export function SDPVerifyPutModal({
  view, candidates, loading, locationEntryKey, onLocationConfirm, onLocationActiveChange,
  onUnassign, onHold, onRedirect, onReturnToReserved,
}: SDPVerifyPutModalProps) {
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReasonCode, setHoldReasonCode] = useState('');
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [existsOpen, setExistsOpen] = useState(false);

  const isHand = view.isHandPut;

  /** Hold Location's Confirm — hands the reason code to the session; closes on success. */
  async function handleConfirmHold() {
    if (!holdReasonCode || holdSubmitting) return;
    setHoldSubmitting(true);
    try {
      if (await onHold(holdReasonCode)) setHoldOpen(false);
    } finally {
      setHoldSubmitting(false);
    }
  }

  return (
    <ModalOverlay width="w-[820px]" position="left" testId="sdp-verify-put-modal">
      <div className="flex flex-col gap-3">
        <DataRow label="Pallet ID"><LiveId type="pallet" id={String(view.pallet.id)} /></DataRow>
        <ItemDescription value={view.pallet.descShort} />
        <DataRow label="DPCI">
          <span className="flex items-center gap-2">
            <LiveId type="dpci" id={view.pallet.dpci} className="!text-[22px]" />
            <StorageCodeBadge storageCode={view.palletStorageCode} />
          </span>
        </DataRow>
        {view.pallet.currentLocation && (
          <DataRow label="Move from"><LiveId type="location" id={view.pallet.currentLocation} /></DataRow>
        )}
        <DataRow label="Directed To">
          <span className="flex items-center gap-2">
            <LiveId type="location" id={view.directedLocation} className="!text-[28px] !font-bold !text-[#FF1A1A]" />
            <StorageCodeBadge storageCode={view.directedLocationStorageCode} size={view.directedLocationSize} />
          </span>
        </DataRow>

        <div className="flex items-end gap-4 mt-1">
          <div className="flex flex-col gap-1">
            <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Confirm Location</span>
            <LocationEntryFields key={locationEntryKey} onResolved={onLocationConfirm} onActiveChange={onLocationActiveChange} size="large" />
          </div>

          {/* Hand Put only — Carton Quantity relocated to sit directly beside Location,
              matching its size/color so the pairing reads as one unit ("put N cartons at
              location Y"), per the design doc. Read-only (same value Rack's own Qty row
              would show), not a NumpadFieldBox — nothing here is worker-editable. */}
          {isHand && (
            <div className="flex flex-col gap-1">
              <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Carton Quantity</span>
              <div className="flex items-center h-[68px] px-5 rounded-[12px] border-2 border-[#3A3A3A] bg-[#0D0D0D]">
                <span className="font-data text-[26px] font-medium text-white">{view.pallet.quantity.cartons}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {!view.isRedirected ? (
              <>
                <button
                  type="button"
                  onClick={onUnassign}
                  disabled={loading}
                  className="h-[72px] px-6 rounded-[12px] font-ui text-[20px] font-semibold transition-colors disabled:opacity-40 bg-[#554400] hover:bg-[#665500] text-white"
                >
                  Unassign
                </button>
                <button
                  type="button"
                  onClick={() => { setHoldReasonCode(''); setHoldOpen(true); }}
                  disabled={loading}
                  className="h-[72px] px-6 rounded-[12px] font-ui text-[20px] font-semibold transition-colors disabled:opacity-40 bg-[#660000] hover:bg-[#770000] text-white"
                >
                  Hold Location
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onUnassign}
                  disabled={loading}
                  className="h-[72px] px-6 rounded-[12px] font-ui text-[20px] font-semibold transition-colors disabled:opacity-40 bg-[#554400] hover:bg-[#665500] text-white"
                >
                  Unassign
                </button>
                {/* Two-line label (same convention as the entry-state "Applying
                    Constraints" bubble) rather than fighting a single line for width —
                    an 8-digit location code reads badly split mid-number by a wrap. */}
                <button
                  type="button"
                  onClick={onReturnToReserved}
                  disabled={loading}
                  className="h-[72px] px-5 rounded-[12px] font-ui font-semibold transition-colors disabled:opacity-40 bg-[#333333] hover:bg-[#444444] text-white flex flex-col items-center justify-center gap-0.5 whitespace-nowrap"
                >
                  <span className="text-[12px] font-medium text-[#BBBBBB] uppercase tracking-wider">Return to</span>
                  <span className="text-[18px]">{fmtLocation(view.reservedLocation)}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Hand Put only — shown once the "exists elsewhere" fetch resolves with at
            least one same-DPCI XS match other than whatever's currently targeted. */}
        {isHand && candidates.length > 0 && (
          <button
            type="button"
            onClick={() => setExistsOpen(true)}
            disabled={loading}
            className="self-start h-[52px] px-6 rounded-[10px] font-ui text-[16px] font-bold transition-colors disabled:opacity-40 bg-[#CC6600] hover:bg-[#DD7700] text-white"
          >
            ⇄ Exists Elsewhere
          </button>
        )}
      </div>

      {holdOpen && (
        <LockedHoldConfirmDialog
          title="Place Hold Both — Blocked Location"
          value={holdReasonCode}
          onChange={setHoldReasonCode}
          defaultNumber="70"
          onBack={() => setHoldOpen(false)}
          onConfirm={() => void handleConfirmHold()}
          confirmDisabled={!holdReasonCode || holdSubmitting}
          backLabel="Close"
          position="top-left"
        />
      )}

      {existsOpen && (
        <ModalOverlay width="w-[600px]">
          <div className="flex flex-col gap-3">
            <span className="font-ui text-[20px] font-semibold text-white">Exists Elsewhere</span>
            {/* max-h + scroll — a popular DPCI can realistically have far more same-DPCI
                XS matches than fit on screen (seen well over 100 in live testing), and
                this list isn't otherwise narrowed by aisle/proximity (matches the design
                doc's own "listing only location and current carton count for each
                match," no distance cutoff specified). */}
            <div className="flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-y-auto max-h-[420px]">
              {candidates.map((entry) => (
                <button
                  key={entry.locationId}
                  type="button"
                  onClick={() => { setExistsOpen(false); onRedirect(entry); }}
                  className="w-full flex items-center justify-between px-5 py-3 border-b border-[#1A1A1A] last:border-b-0 text-left hover:bg-[#111111] transition-colors disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-data text-[20px] font-semibold text-white">{fmtLocation(entry.locationId)}</span>
                    <StorageCodeBadge storageCode={entry.storageCode} badgeSize="compact" />
                  </span>
                  <span className="font-data text-[16px] text-[#9A9A9A]">{entry.currentCartons} cartons</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setExistsOpen(false)}
              className="self-start h-[48px] px-5 rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] text-white disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </ModalOverlay>
      )}
    </ModalOverlay>
  );
}
