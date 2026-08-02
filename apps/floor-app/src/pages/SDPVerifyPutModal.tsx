import { useEffect, useState } from 'react';
import { hasMinRole, type Role } from '@shared/index';
import { DataRow } from '../components/shared/DataRow';
import { HoldPanel } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { LiveId } from '../components/ui/LiveId';
import { ModalOverlay } from '../components/ui/ModalOverlay';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { type SDPDirectedResult } from '../context/SDPContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';

/** A same-DPCI XS location other than the one currently directed — populates the "Exists
 *  elsewhere" popup. Only the fields that popup actually shows/needs (location + carton
 *  count), not the full `ISILocationEntry` shape `/api/items/dpci/:dpci/locations` returns. */
interface ExistsElsewhereEntry {
  locationId: string;
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
  /** "Exists elsewhere" successfully redirected the put to a different location. */
  onRedirected: (newLocation: string, wasMove: boolean) => void;
  /** "Exists elsewhere" released the original reservation but then failed to complete the
   *  redirect — nothing left to retry against (the reservation is gone either way), so the
   *  caller should just reset to entry rather than leave the modal open on stale state. */
  onReservationLost: () => void;
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
 * this component only renders their UI). Hold Location and Hand Put's "Exists elsewhere"
 * are new: Hold Location embeds the shared `HoldPanel` (same component PIP/MNP/WLH
 * already use) and, per direct instruction, **replaces** the old "Blocked Put" button
 * entirely (hardcoded Hold Both + auto-continue to a new location) — it stops once the
 * hold is placed, no auto-continue. "Exists elsewhere" owns its own full mutation
 * sequence (unassign the original reservation, then `POST /api/puts/manual/confirm` with
 * `resolution: 'consolidate'` at the worker-picked location) internally, matching
 * `HoldPanel`'s own precedent of a separate-file component owning its complete mutation
 * lifecycle and only notifying the caller via done-style callbacks.
 */
export function SDPVerifyPutModal({
  directed, loading, locationEntryKey, onLocationConfirm, onLocationActiveChange,
  onUnassign, onHoldDone, onRedirected, onReservationLost,
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

  // Fetches "exists elsewhere" candidates once per directed pallet, Hand Put + IM+ only —
  // the button itself only renders once this resolves with at least one match. IM+-gated
  // because the redirect's own second call (`manual/confirm` with `resolution: 'consolidate'`)
  // is hard-gated `requireRole(auth, 'IM')` server-side (`api/functions/puts.ts`) — showing
  // this to a Worker would let them successfully unassign the original reservation and then
  // hit a 403 on the redirect, orphaning the pallet as `PUT_PENDING` with no reservation.
  // Matches this screen's existing convention (Storage/Zone/Consolidating are IM+-only too).
  useEffect(() => {
    if (!isHand || !isIM) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch<{ locations: { locationId: string; size: string; currentCartons: number }[] }>(
          `/api/items/dpci/${directed.pallet.dpci}/locations`, token!,
        );
        if (cancelled) return;
        setExistsElsewhere(
          result.locations
            .filter((l) => l.size === 'XS' && l.locationId !== directed.directedLocation)
            .map((l) => ({ locationId: l.locationId, currentCartons: l.currentCartons })),
        );
      } catch {
        // Silent — a failed lookup just means "Exists elsewhere" doesn't offer this time;
        // not worth its own error message for what's a convenience shortcut, not a
        // required step (the worker can still Confirm/Unassign normally).
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
    return () => { cancelled = true; };
  }, [isHand, isIM, directed.pallet.dpci, directed.directedLocation]);

  /**
   * Releases the original reservation, then places the pallet at the worker-picked
   * alternate location via MNP's own manual-confirm endpoint (fully self-contained — no
   * dependency on `manual/scan` having run first) with `resolution: 'consolidate'` sent
   * immediately, no intermediate confirmation popup: the picked row is already known (via
   * the same-DPCI-locations fetch that populated this list) to be a same-DPCI XS match, so
   * there's nothing left to confirm. If the second call fails after the first succeeds,
   * the pallet is left `PUT_PENDING` with no reservation — `onReservationLost` tells the
   * caller to reset rather than leave the modal open against a reservation that's gone.
   *
   * The `consolidate` resolution always merges into an existing occupant pallet (never a
   * bare move onto an empty/staged location — `manualConfirm`'s own occupant/`matchesDpci`
   * check guarantees that), so the response is the `{consolidated, location, ...}` shape,
   * not `{location, wasMove}` like a plain confirm — whether this counts as a Move for the
   * session history badge is instead read off `directed.pallet.currentLocation` (already
   * known client-side from the original directedPut response), same "was this pallet
   * already stored somewhere" signal Move detection uses everywhere else on this screen.
   */
  async function pickExistsElsewhere(entry: ExistsElsewhereEntry) {
    if (redirecting) return;
    setRedirecting(true);
    try {
      await apiFetch(`/api/puts/${directed.reservationId}/unassign`, token!, { method: 'POST' });
      try {
        const level = parseInt(entry.locationId.slice(6, 8), 10);
        const result = await apiFetch<{ consolidated: true; location: string }>(
          '/api/puts/manual/confirm', token!,
          {
            method: 'POST',
            body: JSON.stringify({
              palletId: directed.pallet.id, destinationLocation: entry.locationId, level,
              resolution: 'consolidate',
            }),
          },
        );
        playAlert('info');
        setMessage({ type: 'success', text: `Redirected — consolidated into ${fmtLocation(result.location)}` });
        setExistsOpen(false);
        onRedirected(result.location, directed.pallet.currentLocation != null);
      } catch {
        playAlert('error');
        setMessage({ type: 'error', text: 'Redirect failed after releasing the original reservation — re-enter this pallet from Aisle entry' });
        setExistsOpen(false);
        onReservationLost();
      }
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Redirect failed — please try again' });
    } finally {
      setRedirecting(false);
    }
  }

  return (
    <ModalOverlay width="w-[820px]" testId="sdp-verify-put-modal">
      <div className="flex flex-col gap-3">
        <DataRow label="Pallet ID"><LiveId type="pallet" id={String(directed.pallet.id)} /></DataRow>
        <DataRow label="Item">{directed.pallet.descShort}</DataRow>
        <DataRow label="DPCI"><LiveId type="dpci" id={directed.pallet.dpci} className="!text-[22px]" /></DataRow>
        {directed.pallet.currentLocation && (
          <DataRow label="Move from"><LiveId type="location" id={directed.pallet.currentLocation} /></DataRow>
        )}

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
          </div>
        </div>

        {/* Hand Put + IM+ only (see the fetch effect's own comment for why) — shown once
            the "exists elsewhere" fetch above resolves with at least one same-DPCI XS
            match. `isIM` here is belt-and-suspenders: the fetch never runs for a Worker,
            so `existsElsewhere` alone would already stay empty, but this makes the gate
            explicit rather than incidental, matching SDPPage's own `isIM && (...)` convention. */}
        {isHand && isIM && existsElsewhere.length > 0 && (
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
            <div className="flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-hidden">
              {existsElsewhere.map((entry) => (
                <button
                  key={entry.locationId}
                  type="button"
                  onClick={() => void pickExistsElsewhere(entry)}
                  disabled={redirecting}
                  className="w-full flex items-center justify-between px-5 py-3 border-b border-[#1A1A1A] last:border-b-0 text-left hover:bg-[#111111] transition-colors disabled:opacity-40"
                >
                  <span className="font-data text-[20px] font-semibold text-white">{fmtLocation(entry.locationId)}</span>
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
