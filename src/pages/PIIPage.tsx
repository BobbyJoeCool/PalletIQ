import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataRow } from '../components/shared/DataRow';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
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
  status: string;
  location: { aisle: number; bin: number; level: number } | null;
  receivedBy: UserStamp;
  receivedAt: string;
  putBy: UserStamp | null;
  putAt: string | null;
  lastPulledBy: UserStamp | null;
  lastPulledAt: string | null;
}

/** Formats a DPCI object as `DDD-CC-IIII`. */
function fmtDpci(dpci: { dept: number; class: number; item: number }): string {
  return `${String(dpci.dept).padStart(3, '0')}-${String(dpci.class).padStart(2, '0')}-${String(dpci.item).padStart(4, '0')}`;
}

/** Formats a location object as its canonical 8-digit id (Aisle+Bin+Level). */
function location8(loc: { aisle: number; bin: number; level: number }): string {
  return String(loc.aisle).padStart(3, '0') + String(loc.bin).padStart(3, '0') + String(loc.level).padStart(2, '0');
}

/** Formats a "who/when" audit stamp for display, or an em dash if the pallet hasn't reached that stage yet. */
function fmtUser(u: UserStamp | null, at: string | null): string {
  if (!u || !at) return '—';
  return `${u.firstName} ${u.lastName.charAt(0)}. — ${new Date(at).toLocaleString()}`;
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  const [screenState, setScreenState] = useState<ScreenState>('ready');
  const [pallet, setPallet] = useState<PalletData | null>(null);
  const [loading, setLoading] = useState(false);

  const palletField = useNumpadField();

  // Edit-mode field values, seeded from the loaded pallet on entering edit mode.
  const [editDpci, setEditDpci] = useState('');
  const [editVcp, setEditVcp] = useState('');
  const [editSsp, setEditSsp] = useState('');
  const [editCartons, setEditCartons] = useState('');
  const [editSSPs, setEditSSPs] = useState('');
  const [saving, setSaving] = useState(false);

  /** Looks up a pallet by id via the API and transitions to the loaded state; resets to ready on failure. */
  const loadPallet = useCallback(async (idStr: string) => {
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
  }, [token]);

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
    setEditDpci(fmtDpci(pallet.dpci));
    setEditVcp(String(pallet.vcp));
    setEditSsp(String(pallet.ssp));
    setEditCartons(String(pallet.currentCartons));
    setEditSSPs(String(pallet.currentSSPs));
    setScreenState('edit');
  }

  /** Discards edit-mode changes and returns to the loaded (read-only) state. */
  function cancelEdit() {
    setScreenState('loaded');
  }

  /** Submits only the edit-mode fields that actually changed via PATCH /api/pallets/:pid, then re-loads the pallet. */
  async function saveEdit() {
    if (!pallet || saving) return;
    setSaving(true);
    try {
      const digits = editDpci.replace(/-/g, '');
      const body: Record<string, unknown> = {};

      if (/^\d{9}$/.test(digits)) {
        const dept = parseInt(digits.slice(0, 3), 10);
        const cls = parseInt(digits.slice(3, 5), 10);
        const itm = parseInt(digits.slice(5, 9), 10);
        if (dept !== pallet.dpci.dept || cls !== pallet.dpci.class || itm !== pallet.dpci.item) {
          body.dpci = { dept, class: cls, item: itm };
        }
      }
      const vcp = parseInt(editVcp, 10);
      if (!isNaN(vcp) && vcp !== pallet.vcp) body.vcp = vcp;
      const ssp = parseInt(editSsp, 10);
      if (!isNaN(ssp) && ssp !== pallet.ssp) body.ssp = ssp;
      const cartons = parseInt(editCartons, 10);
      if (!isNaN(cartons) && cartons !== pallet.currentCartons) body.currentCartons = cartons;
      const ssps = parseInt(editSSPs, 10);
      if (!isNaN(ssps) && ssps !== pallet.currentSSPs) body.currentSSPs = ssps;

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
          className="flex items-center h-[64px] w-full px-5 mt-1 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors"
        >
          <span className="font-data text-[26px] font-medium text-white">
            {palletField.value || <span className="text-[#444]">—</span>}
          </span>
        </button>
      </div>

      {loading && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {pallet && screenState !== 'ready' && (
        <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px]">
          <DataRow label="Pallet ID"><LiveId type="pallet" id={String(pallet.pid)} /></DataRow>

          {screenState === 'edit' ? (
            <>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">DPCI</span>
                <input aria-label="DPCI" value={editDpci} onChange={(e) => setEditDpci(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] focus:outline-none focus:border-[#CC0000]" />
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
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Cartons on Pallet</span>
                <input aria-label="Cartons on Pallet" type="number" value={editCartons} onChange={(e) => setEditCartons(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] w-[140px] focus:outline-none focus:border-[#CC0000]" />
              </div>
              <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">SSPs on Pallet</span>
                <input aria-label="SSPs on Pallet" type="number" value={editSSPs} onChange={(e) => setEditSSPs(e.target.value)} className="font-data text-[20px] text-white bg-[#0D0D0D] border-2 border-[#3A3A3A] rounded-[8px] px-3 h-[44px] w-[140px] focus:outline-none focus:border-[#CC0000]" />
              </div>
            </>
          ) : (
            <>
              <DataRow label="DPCI">{fmtDpci(pallet.dpci)}</DataRow>
              <DataRow label="UPC">{pallet.upc}</DataRow>
              <DataRow label="VCP">{pallet.vcp}</DataRow>
              <DataRow label="SSP">{pallet.ssp}</DataRow>
              <DataRow label="Cartons on Pallet">{pallet.currentCartons}</DataRow>
              <DataRow label="SSPs on Pallet">{pallet.currentSSPs}</DataRow>
              <DataRow label="Status"><StatusBadge status={pallet.status} /></DataRow>
              <DataRow label="Current Location">
                {pallet.location ? <LiveId type="location" id={location8(pallet.location)} /> : '—'}
              </DataRow>
              <DataRow label="Received By">{fmtUser(pallet.receivedBy, pallet.receivedAt)}</DataRow>
              <DataRow label="Put By">{fmtUser(pallet.putBy, pallet.putAt)}</DataRow>
              <DataRow label="Last Pulled By">{fmtUser(pallet.lastPulledBy, pallet.lastPulledAt)}</DataRow>
            </>
          )}

          <div className="flex gap-3 mt-4">
            {screenState === 'edit' ? (
              <>
                <button type="button" onClick={cancelEdit} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-medium border border-[#3A3A3A] text-white">
                  Cancel
                </button>
                <button type="button" onClick={saveEdit} disabled={saving} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40">
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
