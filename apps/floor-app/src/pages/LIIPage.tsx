import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataRow } from '../components/shared/DataRow';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useLII, type LIILocationData } from '../context/LIIContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';

const HOLD_NAMES: Record<string, string> = {
  HOLD_IN: 'Hold Inbound',
  HOLD_OUT: 'Hold Outbound',
  HOLD_BOTH: 'Hold Both',
  HOLD_PERM: 'Hold Permanent',
};

/**
 * LII — Location ID Info. Read-only location lookup for all roles via a three-field
 * Aisle/Bin/Level entry (auto-advance) or a full barcode scan. Shows a pallet summary
 * panel (always visible — "PALLET 0/0" with dashes when unoccupied, paged with Next/Prev
 * when more than one pallet occupies the location per issue #87) alongside the location
 * detail column. "Go to Pallet ID" and "Hold" navigate to PII/WLH. Loaded location
 * persists across navigation via LIIContext (see DevNotes/Fixes/LII/01). See
 * DevNotes/Screen-Specs/LII.md.
 */
export function LIIPage() {
  const { token } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // LII#01: the loaded location lives in LIIProvider (mounted above the route tree, see
  // App.tsx), not local state, so it survives navigating away and back.
  const { location: loaded, setLocation: setLoaded } = useLII();
  const [loading, setLoading] = useState(false);
  const [entryKey, setEntryKey] = useState(0);
  const [palletIndex, setPalletIndex] = useState(0);

  // Only auto-focus the entry boxes on a genuinely fresh visit — if a location was
  // already restored from LIIContext, yanking focus into the (now-redundant) entry boxes
  // on mount would pop the numpad panel open over the restored detail. Computed once at
  // mount rather than reactively, since LocationEntryFields' own autoFocus effect only
  // ever runs once per LIIPage mount anyway.
  const [initialAutoFocus] = useState(() => !loaded);

  const locationId = loaded?.locationId ?? null;
  const location = loaded?.data ?? null;

  /** Looks up a location (by 6- or 8-digit id) via the API and reconstructs the canonical 8-digit id from the resolved fields. */
  const loadLocation = useCallback(async (id: string) => {
    clearMessage();
    setLoading(true);
    try {
      const data = await apiFetch<LIILocationData>(`/api/locations/${id}`, token!);
      // Reconstruct the canonical 8-digit id from the resolved fields rather than
      // trusting the input string — a 6-digit lookup (e.g. a demo button, which only
      // knows Aisle+Bin) would otherwise leave locationId level-ambiguous, and the Hold
      // endpoint requires an exact 8-digit id.
      setLoaded({
        locationId:
          String(data.aisle).padStart(3, '0') + String(data.bin).padStart(3, '0') + String(data.level).padStart(2, '0'),
        data,
      });
      setPalletIndex(0);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Location not found' });
      setLoaded(null);
      setEntryKey((k) => k + 1); // remounts LocationEntryFields, clearing its fields
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clearMessage]);

  // Pre-population via ?id= (LiveId taps navigate to /location?id=<8-digit>).
  const idParam = searchParams.get('id');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?id= pre-population)
    if (idParam) void loadLocation(idParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  /** Navigates to PII for whichever occupant pallet is currently paged into view. */
  function goToPallet() {
    const pallet = location?.pallets[palletIndex];
    if (!pallet) return;
    navigate(`/pallet?id=${pallet.id}`);
  }

  /** Navigates to WLH for the currently loaded location. */
  function goToHold() {
    if (!locationId) return;
    navigate(`/hold?id=${locationId}`);
  }

  // Demo buttons (Feature 9, Phase 2) — Location ID's own Demo Scanner is now owned
  // internally by LocationEntryFields itself (`demoScanner` prop below), replacing LII's
  // own hand-rolled ✓ Scan/Find by Status/✗ Bad buttons and its flat single-select
  // DemoPicker — the Demo Scanner's Filter popup expresses Status/Hold/Contraction/
  // Multi-Occupant as four independent axes instead, a genuine capability upgrade over the
  // old flat 8-option list, which couldn't express combinations.

  // ── Render ───────────────────────────────────────────────────────────────────

  const palletCount = location?.pallets.length ?? 0;
  const pallet = location && palletCount > 0 ? location.pallets[palletIndex] : null;

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-5 select-none">
      <LocationEntryFields key={entryKey} onResolved={loadLocation} value={locationId ?? ''} autoFocus={initialAutoFocus} demoScanner />

      {loading && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {location && locationId && !loading && (
        <div className="flex-1 flex flex-col overflow-y-auto max-w-[1100px]">
          <div className="flex gap-8">
            <div className="flex-1 flex flex-col">
              <DataRow label="Location ID"><LiveId type="location" id={locationId} /></DataRow>
              <DataRow label="Aisle">{location.aisle}</DataRow>
              <DataRow label="Bin">{location.bin}</DataRow>
              <DataRow label="Level">{location.level}</DataRow>
              <DataRow label="Zone">{location.zone}</DataRow>
              <DataRow label="Size">{location.size}</DataRow>
              <DataRow label="Storage Code">{location.storageCode}</DataRow>
              <DataRow label="Status">
                <div className="flex items-center gap-2">
                  <StatusBadge status={location.status} />
                  {location.contraction && <StatusBadge status="CONTRACTED" variant="danger" />}
                </div>
              </DataRow>
              <DataRow label="Hold">
                {location.holdCategory ? <StatusBadge status={HOLD_NAMES[location.holdCategory] ?? location.holdCategory} variant="danger" /> : 'None'}
              </DataRow>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-1 py-2">
                <span className="font-ui text-[19px] font-bold text-white">
                  PALLET {palletCount === 0 ? '0/0' : `${palletIndex + 1}/${palletCount}`}
                </span>
                {palletCount > 1 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPalletIndex((i) => (i - 1 + palletCount) % palletCount)}
                      className="h-[34px] px-3 rounded-[8px] font-ui text-[14px] font-semibold border border-[#3A3A3A] text-white hover:border-[#555] transition-colors"
                    >
                      ‹ Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setPalletIndex((i) => (i + 1) % palletCount)}
                      className="h-[34px] px-3 rounded-[8px] font-ui text-[14px] font-semibold border border-[#3A3A3A] text-white hover:border-[#555] transition-colors"
                    >
                      Next ›
                    </button>
                  </div>
                )}
              </div>
              <DataRow label="Pallet ID">{pallet ? <LiveId type="pallet" id={String(pallet.id)} /> : '—'}</DataRow>
              <DataRow label="DPCI">{pallet ? <LiveId type="dpci" id={pallet.dpci} /> : '—'}</DataRow>
              <DataRow label="Description">{pallet ? pallet.descShort : '—'}</DataRow>
              <DataRow label="Cartons">{pallet ? pallet.cartons : '—'}</DataRow>
              <DataRow label="Pallets">{pallet ? pallet.pallets : '—'}</DataRow>
              <DataRow label="SSPs">{pallet ? pallet.ssps : '—'}</DataRow>
              <DataRow label="Pallet Status">{pallet ? <StatusBadge status={pallet.status} /> : '—'}</DataRow>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={goToPallet}
              disabled={!pallet}
              className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
            >
              Go to Pallet ID
            </button>
            <button type="button" onClick={goToHold} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold border border-[#3A3A3A] text-white hover:border-[#555] transition-colors">
              Hold
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
