import { useEffect, useState } from 'react';
import { hasMinRole, type Role } from '@shared/index';
import { DataRow } from '../components/shared/DataRow';
import { HoldPanel } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { StorageCodeBadge } from '../components/shared/StorageCodeBadge';
import { LiveId } from '../components/ui/LiveId';
import { ModalOverlay } from '../components/ui/ModalOverlay';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { type SDPDirectedResult } from '../context/SDPContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';

/** A same-DPCI XS location — populates the "Exists elsewhere" popup. Only the fields
 *  that popup actually shows/needs (location + Storage Code + carton count), not the
 *  full `ISILocationEntry` shape `/api/items/dpci/:dpci/locations` returns. */
interface ExistsElsewhereEntry {
  locationId: string;
  storageCode: string;
  currentCartons: number;
}

interface SDPVerifyPutModalProps {
  directed: SDPDirectedResult;
  loading: boolean;
  locationEntryKey: number;
  onLocationConfirm: (value: string, wasScanned: boolean) => void;
  onLocationActiveChange: (active: boolean) => void;
  onUnassign: () => void;
  /** Hold Location's own placement (`HoldPanel`, embedded below) already clears the
   *  reservation server-side as a side effect of placing the hold (Logic Gate — #149,
   *  `placeHold`'s new `CLEAR_LOCATION` call) — this callback fires once that's done and
   *  only needs to reset local screen state, no API call of its own. */
  onHoldDone: () => void;
  /** A worker picked an Exists Elsewhere candidate — retargets `directed` at it. Does
   *  *not* complete the put; the worker still has to confirm the new location like any
   *  other target (see this component's own top-of-file doc comment). */
  onRedirect: (newLocation: string, newStorageCode: string) => void;
  /** Return-to-Original button — swaps the target back to `directed.original`. */
  onReturnToOriginal: () => void;
  /** Cancel button — the redirected-flow's sibling to Unassign, for once there's no
   *  longer a live reservation to release. */
  onCancelRedirect: () => void;
}

/**
 * SDP's Verify-Put Modal (GitHub #151) — replaces the screen's old inline "Confirm
 * Location" block with a screen-blocking popup, per the design doc
 * (`DevNotes/DesignPrompts/Shared-Infrastructure-Design-Spec.md`). Two bodies only —
 * **Rack** (everything but XS) and **Hand** (XS) — Bulk Put is out of scope for this
 * build, per direct instruction.
 *
 * Confirm/Unassign are unchanged existing SDP actions, passed down as callbacks
 * (`onLocationConfirm`/`onUnassign` — both already fully implemented in `SDPPage.tsx`,
 * this component only renders their UI). Hold Location embeds the shared `HoldPanel`
 * (same component PIP/MNP/WLH already use) and, per direct instruction, **replaces** the
 * old "Blocked Put" button entirely (hardcoded Hold Both + auto-continue to a new
 * location) — it stops once the hold is placed, no auto-continue.
 *
 * **Exists Elsewhere (Hand Put + IM+) is a redirect, not a shortcut confirm.** Picking a
 * candidate releases the original reservation (only on the *first* pick — see
 * `pickExistsElsewhere`) and retargets `directed.directedLocation`/
 * `directedLocationStorageCode` at it; it does **not** place the pallet. The worker still
 * has to scan/type the new location through the same Confirm Location panel as any other
 * target — `directed.hasReservation` flips to `false` once redirected, which is what
 * tells `SDPPage.tsx`'s `handleLocationConfirm` to complete the put via
 * `POST /puts/manual/confirm` instead of the normal reservation-based
 * `POST /puts/:id/confirm` (there's no more Reservation row to confirm against). While
 * `hasReservation` is false: Unassign/Hold Location are replaced by Cancel (nothing left
 * to unassign or hold against this transaction), and once the target has actually moved
 * away from `directed.original`, a Return to Original button reappears — both are pure
 * client-side state swaps (`onReturnToOriginal`/re-picking a candidate), never a second
 * server round-trip, since the original location was only ever released, never
 * reassigned to anyone else in the meantime.
 */
export function SDPVerifyPutModal({
  directed, loading, locationEntryKey, onLocationConfirm, onLocationActiveChange,
  onUnassign, onHoldDone, onRedirect, onReturnToOriginal, onCancelRedirect,
}: SDPVerifyPutModalProps) {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  // AuthUser.role is typed as a loose string (see src/lib/api.ts) — always one of the
  // five real Role values at runtime, since it comes straight from the JWT the server issued.
  const isIM = hasMinRole((user?.role ?? 'WORKER') as Role, 'IM');

  const [holdOpen, setHoldOpen] = useState(false);
  const [existsOpen, setExistsOpen] = useState(false);
  const [existsElsewhere, setExistsElsewhere] = useState<ExistsElsewhereEntry[]>([]);
  const [redirecting, setRedirecting] = useState(false);

  const isHand = directed.directedLocationSize === 'XS';
  const isAtOriginal = directed.original == null || directed.directedLocation === directed.original.location;

  // Fetches "exists elsewhere" candidates once per pallet, Hand Put + IM+ only — the
  // button itself only renders once this resolves with at least one match. IM+-gated
  // because a redirect's own completion (`manual/confirm` with `resolution: 'consolidate'`)
  // is hard-gated `requireRole(auth, 'IM')` server-side (`api/functions/puts.ts`) — showing
  // this to a Worker would let them successfully unassign the original reservation and then
  // hit a 403 when they later try to confirm the redirected location, orphaning the pallet
  // as `PUT_PENDING` with no reservation. Matches this screen's existing convention
  // (Storage/Zone/Consolidating are IM+-only too).
  //
  // Keyed on the DPCI alone (not on `directedLocation`, which now changes as the worker
  // toggles between candidates/original) — the current target is excluded client-side at
  // render time instead, so toggling doesn't re-fire this fetch.
  useEffect(() => {
    if (!isHand || !isIM) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch<{ locations: { locationId: string; storageCode: string; size: string; currentCartons: number }[] }>(
          `/api/items/dpci/${directed.pallet.dpci}/locations`, token!,
        );
        if (cancelled) return;
        setExistsElsewhere(
          result.locations
            // `buildItemLocations` (shared with ISI, `api/functions/items.ts`) returns
            // every pallet row with a location for this DPCI regardless of status or
            // quantity — a `currentCartons: 0` row is a zeroed/consolidated pallet whose
            // location field was never cleared, not a real occupant to consolidate into
            // (its own location's real occupant, if any, wouldn't even be this pallet
            // anymore). Filtering it out here rather than in the shared endpoint, since
            // ISI's own consumers rely on seeing the full unfiltered picture.
            .filter((l) => l.size === 'XS' && l.currentCartons > 0)
            .map((l) => ({ locationId: l.locationId, storageCode: l.storageCode, currentCartons: l.currentCartons })),
        );
      } catch {
        // Silent — a failed lookup just means "Exists elsewhere" doesn't offer this time;
        // not worth its own error message for what's a convenience shortcut, not a
        // required step (the worker can still Confirm/Unassign normally).
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
    return () => { cancelled = true; };
  }, [isHand, isIM, directed.pallet.dpci]);

  /**
   * Releases the original reservation on the *first* redirect only (once
   * `hasReservation` is already false, every subsequent pick — including re-picking the
   * same one — is a pure client-side retarget, no API call, since there's nothing left to
   * release). See this component's own top-of-file doc comment for the full flow;
   * `onRedirect` (owned by `SDPPage.tsx`) does the actual `directed` state update.
   */
  async function pickExistsElsewhere(entry: ExistsElsewhereEntry) {
    if (redirecting) return;
    setExistsOpen(false);
    if (!directed.hasReservation) {
      onRedirect(entry.locationId, entry.storageCode);
      return;
    }
    setRedirecting(true);
    try {
      await apiFetch(`/api/puts/${directed.reservationId}/unassign`, token!, { method: 'POST' });
      onRedirect(entry.locationId, entry.storageCode);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Redirect failed — please try again' });
      setExistsOpen(true);
    } finally {
      setRedirecting(false);
    }
  }

  return (
    <ModalOverlay width="w-[820px]" testId="sdp-verify-put-modal">
      <div className="flex flex-col gap-3">
        <DataRow label="Pallet ID"><LiveId type="pallet" id={String(directed.pallet.id)} /></DataRow>
        <DataRow label="Item">{directed.pallet.descShort}</DataRow>
        <DataRow label="DPCI">
          <span className="flex items-center gap-2">
            <LiveId type="dpci" id={directed.pallet.dpci} className="!text-[22px]" />
            <StorageCodeBadge storageCode={directed.palletStorageCode} />
          </span>
        </DataRow>
        {directed.pallet.currentLocation && (
          <DataRow label="Move from"><LiveId type="location" id={directed.pallet.currentLocation} /></DataRow>
        )}
        <DataRow label="Directed To">
          <span className="flex items-center gap-2">
            <LiveId type="location" id={directed.directedLocation} className="!text-[28px] !font-bold !text-[#FF1A1A]" />
            <StorageCodeBadge storageCode={directed.directedLocationStorageCode} size={directed.directedLocationSize} />
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
                <span className="font-data text-[26px] font-medium text-white">{directed.pallet.quantity.cartons}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {directed.hasReservation ? (
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
                  onClick={() => setHoldOpen(true)}
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
                  onClick={onCancelRedirect}
                  disabled={loading}
                  className="h-[72px] px-6 rounded-[12px] font-ui text-[20px] font-semibold transition-colors disabled:opacity-40 bg-[#554400] hover:bg-[#665500] text-white"
                >
                  Cancel
                </button>
                {/* Two-line label (same convention as the entry-state "Applying
                    Constraints" bubble) rather than fighting a single line for width —
                    an 8-digit location code reads badly split mid-number by a wrap. */}
                {!isAtOriginal && (
                  <button
                    type="button"
                    onClick={onReturnToOriginal}
                    disabled={loading}
                    className="h-[72px] px-5 rounded-[12px] font-ui font-semibold transition-colors disabled:opacity-40 bg-[#333333] hover:bg-[#444444] text-white flex flex-col items-center justify-center gap-0.5 whitespace-nowrap"
                  >
                    <span className="text-[12px] font-medium text-[#BBBBBB] uppercase tracking-wider">Return to</span>
                    <span className="text-[18px]">{fmtLocation(directed.original!.location)}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Hand Put + IM+ only (see the fetch effect's own comment for why) — shown once
            the "exists elsewhere" fetch above resolves with at least one same-DPCI XS
            match other than whatever's currently targeted. */}
        {isHand && isIM && existsElsewhere.some((e) => e.locationId !== directed.directedLocation) && (
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
        <ModalOverlay backdropClassName="p-8" padding="p-6" cardClassName="max-h-full overflow-y-auto" shadow={false}>
          <HoldPanel
            locationId={directed.directedLocation}
            showClose
            onDone={() => { setHoldOpen(false); onHoldDone(); }}
          />
        </ModalOverlay>
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
              {existsElsewhere.filter((entry) => entry.locationId !== directed.directedLocation).map((entry) => (
                <button
                  key={entry.locationId}
                  type="button"
                  onClick={() => void pickExistsElsewhere(entry)}
                  disabled={redirecting}
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
              disabled={redirecting}
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
