import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataRow } from '../components/shared/DataRow';
import { DpciField, type DpciValue } from '../components/shared/DpciField';
import { ReasonCodeField } from '../components/shared/ReasonCodeField';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { EDIT_REASON_CODES } from '../lib/editReasonCodes';
import { fmtDpci } from '../lib/fmt';
import { useNumpadField } from '../lib/useNumpadField';

interface UserStamp {
  zNumber: string;
  firstName: string;
  lastName: string;
}

interface PalletData {
  pid: number;
  dpci: { dept: number; class: number; item: number };
  upc: string;
  vcp: number;
  ssp: number;
  currentCartons: number;
  currentSSPs: number;
  currentPallets: number;
  status: string;
  location: { aisle: number; bin: number; level: number } | null;
  receivedBy: UserStamp;
  receivedAt: string;
  putBy: UserStamp | null;
  putAt: string | null;
  lastPulledBy: UserStamp | null;
  lastPulledAt: string | null;
}

/** Formats a location object as its canonical 8-digit id (Aisle+Bin+Level). */
function location8(loc: { aisle: number; bin: number; level: number }): string {
  return String(loc.aisle).padStart(3, '0') + String(loc.bin).padStart(3, '0') + String(loc.level).padStart(2, '0');
}

/** Formats a "who/when" audit stamp for display, showing the zNumber (issue #7 — not the name), or an em dash if the pallet hasn't reached that stage yet. */
function fmtUser(u: UserStamp | null, at: string | null): string {
  if (!u || !at) return '—';
  return `${u.zNumber} — ${new Date(at).toLocaleString()}`;
}

type ScreenState = 'ready' | 'loaded' | 'edit';

/**
 * PII — Pallet ID Info. Read-only pallet lookup for all roles; IM+ can enter Edit mode
 * (explicit keypress required — role alone doesn't unlock it) to correct DPCI/VCP/SSP/
 * quantity fields. Accessible via Home, HotJump, or tapping any `<LiveId type="pallet">`
 * (which routes here via `?id=`). See DevNotes/Screen-Specs/PII.md.
 */
export function PIIPage() {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  const [screenState, setScreenState] = useState<ScreenState>('ready');
  const [pallet, setPallet] = useState<PalletData | null>(null);
  const [loading, setLoading] = useState(false);

  const palletField = useNumpadField();

  // Edit-mode field values, seeded from the loaded pallet on entering edit mode.
  // DPCI is three separate fields (issue #21), now via the shared DpciField (issue #78).
  const [editDpci, setEditDpci] = useState<DpciValue>({ dept: '', class: '', item: '' });
  const [editVcp, setEditVcp] = useState('');
  const [editSsp, setEditSsp] = useState('');
  const [editCartons, setEditCartons] = useState('');
  const [editSSPs, setEditSSPs] = useState('');
  const [editPallets, setEditPallets] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [saving, setSaving] = useState(false);

  /** Looks up a pallet by id via the API and transitions to the loaded state; resets to ready on failure. */
  const loadPallet = useCallback(async (idStr: string) => {
    hidePanel();
    const pid = parseInt(idStr, 10);
    if (isNaN(pid)) {
      playAlert('error');
      setMessage({ type: 'error', text: 'Pallet not found' });
      palletField.clear();
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<PalletData>(`/api/pallets/${pid}`, token!);
      setPallet(data);
      setScreenState('loaded');
      palletField.set(String(pid));
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Pallet not found' });
      palletField.clear();
      setPallet(null);
      setScreenState('ready');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hidePanel]);

  /** Registers the Pallet ID field's numpad handler; a scan while editing discards unsaved changes and re-loads. */
  const focusPalletField = useCallback(() => {
    palletField.focus((v) => {
      const trimmed = v.trim();
      if (!trimmed) return;
      if (screenState === 'edit') {
        // A new scan while editing discards unsaved changes without a confirmation
        // prompt — this is a demo-scope simplification of PII.md's confirm-before-discard.
        setScreenState('loaded');
      }
      void loadPallet(trimmed);
    });
  }, [palletField, screenState, loadPallet]);

  useEffect(() => {
    // React re-runs this effect whenever the dependency's value changes in *either*
    // direction — including the very first successful scan, which flips it true→false
    // (ready→loaded). Without this guard that transition re-scheduled a focus call too,
    // reopening the numpad right after `loadPallet`'s own `hidePanel()` had just closed it
    // (issue #55 — only ever visible on the first scan of a session, since every load
    // after that starts from 'loaded' already, so the dependency stays false→false and
    // the effect doesn't re-run at all).
    if (screenState !== 'ready') return;
    const id = setTimeout(() => focusPalletField(), 50);
    return () => clearTimeout(id);
    // Only re-run when returning to the ready state — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenState === 'ready']);

  // Pre-population via ?id= (LiveId taps navigate to /pallet?id=<pid>).
  const idParam = searchParams.get('id');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?id= pre-population)
    if (idParam) void loadPallet(idParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  /** Seeds the edit-mode fields from the currently loaded pallet and switches to the edit state. */
  function enterEditMode() {
    if (!pallet) return;
    setEditDpci({
      dept: String(pallet.dpci.dept).padStart(3, '0'),
      class: String(pallet.dpci.class).padStart(2, '0'),
      item: String(pallet.dpci.item).padStart(4, '0'),
    });
    setEditVcp(String(pallet.vcp));
    setEditSsp(String(pallet.ssp));
    setEditCartons(String(pallet.currentCartons));
    setEditSSPs(String(pallet.currentSSPs));
    setEditPallets(String(pallet.currentPallets));
    setReasonCode('');
    setScreenState('edit');
  }

  /** Discards edit-mode changes and returns to the loaded (read-only) state. */
  function cancelEdit() {
    setScreenState('loaded');
  }

  /** Submits only the edit-mode fields that actually changed via PATCH /api/pallets/:pid, then re-loads the pallet. */
  /**
   * The PATCH body fields that actually differ from the loaded pallet — parsed/semantic
   * comparison (e.g. VCP typed as "012" counts as unchanged if it was already 12), not a
   * raw string comparison. Recomputed as the worker edits; also drives the Save button's
   * disabled state (issue #66 — Save used to go through with an empty body, silently
   * "succeeding" without changing anything, as long as a reason code happened to be picked).
   */
  const changedFields = useMemo(() => {
    if (!pallet) return {};
    const body: Record<string, unknown> = {};

    const dept = parseInt(editDpci.dept, 10);
    const cls = parseInt(editDpci.class, 10);
    const itm = parseInt(editDpci.item, 10);
    if (!isNaN(dept) && !isNaN(cls) && !isNaN(itm) &&
        (dept !== pallet.dpci.dept || cls !== pallet.dpci.class || itm !== pallet.dpci.item)) {
      body.dpci = { dept, class: cls, item: itm };
    }
    const vcp = parseInt(editVcp, 10);
    if (!isNaN(vcp) && vcp !== pallet.vcp) body.vcp = vcp;
    const ssp = parseInt(editSsp, 10);
    if (!isNaN(ssp) && ssp !== pallet.ssp) body.ssp = ssp;
    const cartons = parseInt(editCartons, 10);
    if (!isNaN(cartons) && cartons !== pallet.currentCartons) body.currentCartons = cartons;
    const ssps = parseInt(editSSPs, 10);
    if (!isNaN(ssps) && ssps !== pallet.currentSSPs) body.currentSSPs = ssps;
    const pallets = parseInt(editPallets, 10);
    if (!isNaN(pallets) && pallets !== pallet.currentPallets) body.currentPallets = pallets;

    return body;
  }, [pallet, editDpci, editVcp, editSsp, editCartons, editSSPs, editPallets]);

  const hasChanges = Object.keys(changedFields).length > 0;

  async function saveEdit() {
    if (!pallet || saving || !hasChanges) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...changedFields };

      if (!reasonCode) {
        setMessage({ type: 'error', text: 'A reason code is required to save changes' });
        return;
      }
      body.reasonCode = reasonCode;

      await apiFetch(`/api/pallets/${pallet.pid}`, token!, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      playAlert('info');
      setMessage({ type: 'success', text: `Pallet ${pallet.pid} updated` });
      setScreenState('loaded');
      await loadPallet(String(pallet.pid));
    } catch (err) {
      playAlert('error');
      const code = err instanceof Error ? err.message : '';
      setMessage({ type: 'error', text: `Update failed — ${code || 'please try again'}` });
    } finally {
      setSaving(false);
    }
  }

  /** Navigates to LII for the pallet's current location. */
  function goToLocation() {
    if (!pallet?.location) return;
    navigate(`/location?id=${location8(pallet.location)}`);
  }

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real pallet id from the API and loads it, simulating a successful scan. */
  const demoScan = useCallback(async () => {
    try {
      const { palletId } = await apiFetch<{ palletId: number }>('/api/demo/pallet', token!);
      void loadPallet(String(palletId));
    } catch {
      setMessage({ type: 'error', text: 'Demo scan unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Looks up a pallet id that doesn't exist, simulating a not-found scan. */
  const demoBad = useCallback(() => void loadPallet('999999999'), [loadPallet]);

  /** Footer demo-button slot content: a good scan and a bad scan trigger. */
  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoScan} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        ✓ Scan PID
      </button>
      <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        ✗ Bad PID
      </button>
    </>
  ), [demoScan, demoBad]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      <div className="w-[260px]">
        <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">Pallet ID</span>
        <button
          type="button"
          onClick={focusPalletField}
          className={`flex items-center h-[64px] w-full px-5 mt-1 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${palletField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
        >
          <span className="font-data text-[26px] font-medium text-white">
            {palletField.value || <span className="text-[#444]">—</span>}
          </span>
          {palletField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      </div>

      {loading && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {pallet && screenState !== 'ready' && (
        <div className={`flex-1 flex flex-col overflow-y-auto ${screenState === 'edit' ? 'max-w-[720px]' : 'max-w-[1100px]'}`}>
          <DataRow label="Pallet ID"><LiveId type="pallet" id={String(pallet.pid)} /></DataRow>

          {screenState === 'edit' ? (
            <>
              <div className="py-2 border-b border-[#1A1A1A]">
                <DpciField value={editDpci} onChange={setEditDpci} />
              </div>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">VCP</span>
                <input aria-label="VCP" type="number" value={editVcp} onChange={(e) => setEditVcp(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] w-[140px] focus:outline-none focus:border-[#CC0000]" />
              </div>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">SSP</span>
                <input aria-label="SSP" type="number" value={editSsp} onChange={(e) => setEditSsp(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] w-[140px] focus:outline-none focus:border-[#CC0000]" />
              </div>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Total Cartons</span>
                <input aria-label="Total Cartons" type="number" value={editCartons} onChange={(e) => setEditCartons(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] w-[140px] focus:outline-none focus:border-[#CC0000]" />
              </div>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">SSPs on Pallet</span>
                <input aria-label="SSPs on Pallet" type="number" value={editSSPs} onChange={(e) => setEditSSPs(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] w-[140px] focus:outline-none focus:border-[#CC0000]" />
              </div>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Full Pallets</span>
                <input aria-label="Full Pallets" type="number" value={editPallets} onChange={(e) => setEditPallets(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] w-[140px] focus:outline-none focus:border-[#CC0000]" />
              </div>
              <div className="flex items-start gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider pt-3">Reason Code</span>
                <div className="w-[280px]">
                  <ReasonCodeField codes={EDIT_REASON_CODES} value={reasonCode} onChange={setReasonCode} label="" size="compact" />
                </div>
              </div>
            </>
          ) : (
            <div className="flex gap-8">
              <div className="flex-1 flex flex-col">
                <DataRow label="DPCI"><LiveId type="dpci" id={fmtDpci(pallet.dpci)} /></DataRow>
                <DataRow label="UPC"><LiveId type="upc" id={pallet.upc} /></DataRow>
                <DataRow label="VCP">{pallet.vcp}</DataRow>
                <DataRow label="SSP">{pallet.ssp}</DataRow>
                <DataRow label="Total Cartons">{pallet.currentCartons}</DataRow>
                <DataRow label="SSPs on Pallet">{pallet.currentSSPs}</DataRow>
                <DataRow label="Full Pallets">{pallet.currentPallets}</DataRow>
              </div>
              <div className="flex-1 flex flex-col">
                <DataRow label="Status"><StatusBadge status={pallet.status} /></DataRow>
                <DataRow label="Current Location">
                  {pallet.location ? <LiveId type="location" id={location8(pallet.location)} /> : '—'}
                </DataRow>
                <DataRow label="Received By">{fmtUser(pallet.receivedBy, pallet.receivedAt)}</DataRow>
                <DataRow label="Put By">{fmtUser(pallet.putBy, pallet.putAt)}</DataRow>
                <DataRow label="Last Pulled By">{fmtUser(pallet.lastPulledBy, pallet.lastPulledAt)}</DataRow>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            {screenState === 'edit' ? (
              <>
                <button type="button" onClick={cancelEdit} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-medium border border-[#3A3A3A] text-white">
                  Cancel
                </button>
                <button type="button" onClick={saveEdit} disabled={saving || !hasChanges} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40">
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={goToLocation}
                  disabled={!pallet.location}
                  className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
                >
                  Go to Location ID
                </button>
                {isIM && (
                  <button type="button" onClick={enterEditMode} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold border border-[#3A3A3A] text-white hover:border-[#555] transition-colors">
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
