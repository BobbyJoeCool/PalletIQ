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

type HoldCategory = 'HOLD_IN' | 'HOLD_OUT' | 'HOLD_BOTH' | 'HOLD_PERM';

const HOLD_LABELS: Record<HoldCategory, { name: string; blocks: string; placeRole: Role }> = {
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
  /** 8-digit Aisle+Bin+Level location ID. */
  locationId: string;
  /** Called after a successful place/remove, and on Cancel/Close (inline panel use). */
  onDone?: () => void;
  /** Renders a "Cancel"/"Close" affordance appropriate for an inline quick-hold panel. */
  showClose?: boolean;
}

/**
 * Shared hold placement/removal panel — the State 2/3 content of the full WLH screen,
 * and reused as-is for the PIP/SDP/MNP quick-hold panels, per WLH.md's "Build WLH as a
 * shared panel component usable inline on PIP, SDP, and MNP without full navigation."
 * Fetches the location's current hold state itself given a resolved 8-digit locationId —
 * callers don't need to know or pass hold state.
 */
export function HoldPanel({ locationId, onDone, showClose = false }: HoldPanelProps) {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  // AuthUser.role is typed as a loose string (see src/lib/api.ts) — always one of the
  // five real Role values at runtime, since it comes straight from the JWT the server issued.
  const role = (user?.role ?? 'WORKER') as Role;

  const [info, setInfo] = useState<LocationHoldInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState<HoldCategory | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [confirmReplace, setConfirmReplace] = useState<HoldCategory | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Fetches the location's current status/hold info via GET /api/locations/:id. */
  const load = useCallback(async () => {
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

  /** Tapping a hold-type button: goes straight to reason-code entry, or via a replace-confirmation first if a hold is already active. */
  function startPlace(type: HoldCategory) {
    if (info?.holdCategory) {
      setConfirmReplace(type);
    } else {
      setPlacing(type);
    }
  }

  /** Submits the reason code and calls PATCH /api/locations/:id/hold to place/replace the hold. */
  async function confirmPlace(type: HoldCategory) {
    if (!reasonCode || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/locations/${locationId}/hold`, token!, {
        method: 'PATCH',
        body: JSON.stringify({ holdType: type, reasonCode }),
      });
      playAlert('info');
      setMessage({ type: 'success', text: `${HOLD_LABELS[type].name} placed on ${fmtLocation(locationId)}` });
      setPlacing(null);
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

  /** Calls DELETE /api/locations/:id/hold to clear the current hold — no reason code needed. */
  async function removeHold() {
    if (!info?.holdCategory || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/locations/${locationId}/hold`, token!, { method: 'DELETE' });
      playAlert('info');
      setMessage({ type: 'success', text: `Hold removed from ${fmtLocation(locationId)}` });
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

  if (loading) {
    return <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>;
  }
  if (!info) return null;

  const canRemove = info.holdCategory ? hasMinRole(role, REMOVE_ROLE[info.holdCategory]) : false;
  const placeableTypes = (Object.keys(HOLD_LABELS) as HoldCategory[]).filter((t) => hasMinRole(role, HOLD_LABELS[t].placeRole));

  return (
    <div className="flex flex-col gap-4 max-w-[520px]">
      <div className="flex items-center gap-3">
        <span className="font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Current Hold</span>
        <span className={`font-data text-[28px] font-bold ${info.holdCategory ? HOLD_TEXT_COLOR[info.holdCategory] : 'text-white'}`}>
          {info.holdCategory ? HOLD_LABELS[info.holdCategory].name : 'None'}
        </span>
      </div>

      {placing ? (
        <div className="flex flex-col gap-3 p-4 rounded-[12px] bg-[#0D0D0D] border border-[#3A3A3A]">
          <span className="font-ui text-[15px] font-semibold text-white">
            Reason code for {HOLD_LABELS[placing].name}
          </span>
          <ReasonCodeField codes={HOLD_REASON_CODES} value={reasonCode} onChange={setReasonCode} label="" />
          <div className="flex gap-3">
            <button type="button" onClick={() => { setPlacing(null); setReasonCode(''); }} className="flex-1 h-[52px] rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] text-white">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => confirmPlace(placing)}
              disabled={submitting || !reasonCode}
              className="flex-1 h-[52px] rounded-[10px] font-ui text-[15px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40"
            >
              Confirm Hold
            </button>
          </div>
        </div>
      ) : (
        <>
          {info.holdCategory && canRemove && (
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
            {placeableTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => startPlace(t)}
                disabled={info.holdCategory === t}
                className="flex flex-col items-start gap-0.5 px-4 py-3 rounded-[10px] border border-[#3A3A3A] hover:border-[#555] text-left disabled:opacity-40 transition-colors"
              >
                <span className="font-ui text-[16px] font-semibold text-white">{HOLD_LABELS[t].name}</span>
                <span className="font-ui text-[13px] text-[#9A9A9A]">{HOLD_LABELS[t].blocks}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {showClose && !placing && (
        <button type="button" onClick={onDone} className="h-[48px] px-5 rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] text-white self-start">
          Close
        </button>
      )}

      {confirmReplace && (
        <ConfirmDialog
          title="Replace existing hold?"
          message={`${fmtLocation(locationId)} already has ${info.holdCategory ? HOLD_LABELS[info.holdCategory].name : 'a hold'} — placing ${HOLD_LABELS[confirmReplace].name} will replace it.`}
          confirmLabel="Replace"
          variant="danger"
          onConfirm={() => { const t = confirmReplace; setConfirmReplace(null); setPlacing(t); }}
          onCancel={() => setConfirmReplace(null)}
        />
      )}
    </div>
  );
}
