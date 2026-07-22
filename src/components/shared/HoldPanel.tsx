import { useCallback, useEffect, useState } from 'react';
import { hasMinRole, type Role } from '@shared/index';
import { useAuth } from '../../context/AuthContext';
import { useMessageBar } from '../../context/MessageBarContext';
import { apiFetch } from '../../lib/api';
import { playAlert } from '../../lib/audio';
import { fmtLocation } from '../../lib/fmt';
import { HOLD_REASON_CODES } from '../../lib/holdReasonCodes';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ReasonCodeField } from './ReasonCodeField';

export type HoldCategory = 'HOLD_IN' | 'HOLD_OUT' | 'HOLD_BOTH' | 'HOLD_PERM';

// Exported for WLH's Range mode (issue #14), which needs the same hold-type names/roles
// for its own hold-type button list — a range action has no single "current hold" to
// react to the way HoldPanel's own placeableTypes computation does, so it can't just
// reuse this component wholesale, but shouldn't duplicate these labels either.
export const HOLD_LABELS: Record<HoldCategory, { name: string; blocks: string; placeRole: Role }> = {
  HOLD_IN:   { name: 'Hold Inbound',   blocks: 'Blocks new puts to this location',                    placeRole: 'IM' },
  HOLD_OUT:  { name: 'Hold Outbound',  blocks: 'Blocks new label generation for this location',       placeRole: 'IM' },
  HOLD_BOTH: { name: 'Hold Both',      blocks: 'Blocks puts and new label generation',                placeRole: 'WORKER' },
  HOLD_PERM: { name: 'Hold Permanent', blocks: 'Blocks everything — location out of service',         placeRole: 'LEAD' },
};

// Hold Both may be removed only by IM+, even though any role can place it.
const REMOVE_ROLE: Record<HoldCategory, Role> = {
  HOLD_IN: 'IM', HOLD_OUT: 'IM', HOLD_BOTH: 'IM', HOLD_PERM: 'LEAD',
};

// Color coding for the Current Hold display (issue #27): Hold Both reads as a caution
// (yellow), Hold Permanent as the most severe (red), and the two directional holds
// (Hold Inbound/Outbound) as informational (blue) — matches this app's StatusBadge
// "info"/"warning"/"danger" variant colors without pulling in StatusBadge's pill shape,
// since this display isn't a badge.
const HOLD_TEXT_COLOR: Record<HoldCategory, string> = {
  HOLD_IN:   'text-[#4499FF]',
  HOLD_OUT:  'text-[#4499FF]',
  HOLD_BOTH: 'text-[#DDAA00]',
  HOLD_PERM: 'text-[#FF4444]',
};

interface LocationHoldInfo {
  status: string;
  holdCategory: HoldCategory | null;
}

interface HoldPanelProps {
  /** 8-digit Aisle+Bin+Level location ID, or `null` when nothing's been resolved yet
   *  (v1.6.10) — WLH's Single Location mode renders this panel from first navigation,
   *  before any scan, so a real id isn't guaranteed to exist. The full UI still renders
   *  in that case, just with Current Hold blank and every action control disabled. Every
   *  other caller (PIP/SDP/MNP's inline quick-hold panels) only ever mounts this with a
   *  real, already-resolved id and is unaffected. */
  locationId: string | null;
  /** Called after a successful place/remove, and on Cancel/Close (inline panel use). */
  onDone?: () => void;
  /** Renders a "Cancel"/"Close" affordance appropriate for an inline quick-hold panel. */
  showClose?: boolean;
  /** Called with a one-line summary after a successful place or remove — WLH's own Single
   *  Location flow feeds this into its session Log panel (v1.6.10); other callers (PIP/SDP/
   *  MNP's inline quick-hold panels) leave it unset and get no log entry. */
  onAction?: (summary: string) => void;
}

/**
 * Shared hold placement/removal panel — the State 2/3 content of the full WLH screen,
 * and reused as-is for the PIP/SDP/MNP quick-hold panels, per WLH.md's "Build WLH as a
 * shared panel component usable inline on PIP, SDP, and MNP without full navigation."
 * Fetches the location's current hold state itself given a resolved 8-digit locationId —
 * callers don't need to know or pass hold state.
 */
export function HoldPanel({ locationId, onDone, showClose = false, onAction }: HoldPanelProps) {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  // AuthUser.role is typed as a loose string (see src/lib/api.ts) — always one of the
  // five real Role values at runtime, since it comes straight from the JWT the server issued.
  const role = (user?.role ?? 'WORKER') as Role;

  const [info, setInfo] = useState<LocationHoldInfo | null>(null);
  const [loading, setLoading] = useState(false);
  // selectedType: which Hold Type button is currently picked — always visible alongside
  // Reason Code and Confirm Hold now (direct instruction, replacing the earlier "tap a
  // type to reveal Reason Code + Confirm" two-step flow), rather than gating those on a
  // tap first.
  const [selectedType, setSelectedType] = useState<HoldCategory | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [confirmReplace, setConfirmReplace] = useState<HoldCategory | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasLocation = locationId != null;

  /** Fetches the location's current status/hold info via GET /api/locations/:id — a no-op
   *  (clears to the "no location yet" state) when locationId is null. */
  const load = useCallback(async () => {
    if (!locationId) {
      setInfo(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<LocationHoldInfo>(`/api/locations/${locationId}`, token!);
      setInfo({ status: data.status, holdCategory: data.holdCategory });
    } catch {
      setMessage({ type: 'error', text: 'Location not found' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (loads hold state for locationId)
    void load();
  }, [load]);

  // Clears any in-progress selection whenever the underlying location changes (including
  // to/from null) — this panel can now stay mounted continuously across a whole WLH
  // session (v1.6.10) instead of only mounting once a location was already resolved, so a
  // stale Hold Type/Reason Code selection from a previous location must not silently
  // carry over into a newly scanned one.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets selection on locationId change, not a derived-render concern
    setSelectedType(null);
    setReasonCode('');
  }, [locationId]);

  /** Submits the reason code and calls PATCH /api/locations/:id/hold to place/replace the hold. */
  async function confirmPlace(type: HoldCategory) {
    if (!locationId || !reasonCode || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/locations/${locationId}/hold`, token!, {
        method: 'PATCH',
        body: JSON.stringify({ holdType: type, reasonCode }),
      });
      playAlert('info');
      setMessage({ type: 'success', text: `${HOLD_LABELS[type].name} placed on ${fmtLocation(locationId)}` });
      onAction?.(`Placed ${HOLD_LABELS[type].name} on ${fmtLocation(locationId)}`);
      setSelectedType(null);
      setReasonCode('');
      await load();
      onDone?.();
    } catch (err) {
      playAlert('error');
      const code = err instanceof Error ? err.message : '';
      setMessage({ type: 'error', text: code === 'FORBIDDEN' ? `You do not have permission to place ${HOLD_LABELS[type].name} holds` : 'Hold placement failed — please try again' });
    } finally {
      setSubmitting(false);
    }
  }

  /** Confirm Hold button: replacing a different existing hold still raises the "Replace
   *  existing hold?" warning (now at submit time, since Reason Code is filled in upfront
   *  rather than after that warning as the old two-step flow had it) — placing onto an
   *  unheld location skips straight to confirmPlace. */
  function handleConfirmClick() {
    if (!locationId || !selectedType || !reasonCode || submitting) return;
    if (info?.holdCategory && info.holdCategory !== selectedType) {
      setConfirmReplace(selectedType);
    } else {
      void confirmPlace(selectedType);
    }
  }

  /** Calls DELETE /api/locations/:id/hold to clear the current hold — no reason code needed. */
  async function removeHold() {
    if (!locationId || !info?.holdCategory || submitting) return;
    const removedType = info.holdCategory;
    setSubmitting(true);
    try {
      await apiFetch(`/api/locations/${locationId}/hold`, token!, { method: 'DELETE' });
      playAlert('info');
      setMessage({ type: 'success', text: `Hold removed from ${fmtLocation(locationId)}` });
      onAction?.(`Removed ${HOLD_LABELS[removedType].name} from ${fmtLocation(locationId)}`);
      await load();
      onDone?.();
    } catch (err) {
      playAlert('error');
      const code = err instanceof Error ? err.message : '';
      setMessage({ type: 'error', text: code === 'FORBIDDEN' ? 'You do not have permission to remove this hold' : 'Hold removal failed — please try again' });
    } finally {
      setSubmitting(false);
    }
  }

  // Full UI renders unconditionally now (v1.6.10, direct instruction) — no more
  // `if (loading) return ...`/`if (!info) return null` early-outs that hid everything
  // until a location was resolved. Current Hold shows "—" with no location, "Loading…"
  // while `info` is being fetched, and the real value once it lands; every action control
  // below is disabled until `info` (a genuinely resolved location) actually exists.
  const canRemove = info?.holdCategory ? hasMinRole(role, REMOVE_ROLE[info.holdCategory]) : false;
  // Changing a location to a *different* hold type is equivalent to removing whatever's
  // currently on it (a role that can't remove the current hold shouldn't be able to route
  // around that gate by placing a lesser one instead — e.g. a sub-Lead role could
  // previously replace an existing Hold Permanent with Hold Both, despite never having
  // permission to remove the Perm hold itself, since Hold Both's own placeRole is WORKER).
  // No types are placeable at all while a hold exists that this role can't remove; with no
  // current hold, the normal per-type placeRole gate applies as before.
  const placeableTypes = info?.holdCategory && !canRemove
    ? []
    : (Object.keys(HOLD_LABELS) as HoldCategory[]).filter((t) => hasMinRole(role, HOLD_LABELS[t].placeRole));
  const currentHoldLabel = !hasLocation ? '—' : loading ? 'Loading…' : info?.holdCategory ? HOLD_LABELS[info.holdCategory].name : 'None';
  const currentHoldColor = info?.holdCategory ? HOLD_TEXT_COLOR[info.holdCategory] : hasLocation && !loading ? 'text-white' : 'text-[#666]';

  return (
    <div className="flex flex-col gap-4 max-w-[520px]">
      <div className="flex items-center gap-3">
        <span className="font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Current Hold</span>
        <span className={`font-data text-[28px] font-bold ${currentHoldColor} ${loading ? 'animate-pulse' : ''}`}>
          {currentHoldLabel}
        </span>
      </div>

      {info?.holdCategory && canRemove && (
        <button
          type="button"
          onClick={removeHold}
          disabled={submitting}
          className="h-[52px] px-5 rounded-[10px] font-ui text-[15px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 self-start"
        >
          Remove Hold
        </button>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Hold Type</span>
        <div className="grid grid-cols-2 gap-2">
          {placeableTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedType(t)}
              disabled={!info || info.holdCategory === t}
              className={`flex flex-col items-start gap-0.5 px-4 py-3 rounded-[10px] border text-left disabled:opacity-40 transition-colors ${
                selectedType === t ? 'border-[#CC0000] bg-[#CC0000]/10' : 'border-[#3A3A3A] hover:border-[#555]'
              }`}
            >
              <span className="font-ui text-[16px] font-semibold text-white">{HOLD_LABELS[t].name}</span>
              <span className="font-ui text-[13px] text-[#9A9A9A]">{HOLD_LABELS[t].blocks}</span>
            </button>
          ))}
        </div>
      </div>

      <ReasonCodeField codes={HOLD_REASON_CODES} value={reasonCode} onChange={setReasonCode} label="Reason Code" disabled={!info} />

      <button
        type="button"
        onClick={handleConfirmClick}
        disabled={submitting || !info || !selectedType || !reasonCode}
        className="h-[52px] px-5 rounded-[10px] font-ui text-[15px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40 self-start"
      >
        Confirm Hold
      </button>

      {showClose && (
        <button type="button" onClick={onDone} className="h-[48px] px-5 rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] text-white self-start">
          Close
        </button>
      )}

      {confirmReplace && locationId && info && (
        <ConfirmDialog
          title="Replace existing hold?"
          message={`${fmtLocation(locationId)} already has ${info.holdCategory ? HOLD_LABELS[info.holdCategory].name : 'a hold'} — placing ${HOLD_LABELS[confirmReplace].name} will replace it.`}
          confirmLabel="Replace"
          variant="danger"
          onConfirm={() => { const t = confirmReplace; setConfirmReplace(null); void confirmPlace(t); }}
          onCancel={() => setConfirmReplace(null)}
        />
      )}
    </div>
  );
}
