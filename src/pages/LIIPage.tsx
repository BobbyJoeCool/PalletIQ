import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataRow } from '../components/shared/DataRow';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';

interface PalletSummary {
  id: number;
  dpci: string;
  cartons: number;
  pallets: number;
  ssps: number;
  status: string;
}

interface LocationData {
  aisle: number;
  bin: number;
  level: number;
  zone: number;
  storageCode: string;
  size: string;
  status: string;
  holdCategory: string | null;
  pallet: PalletSummary | null;
}

const HOLD_NAMES: Record<string, string> = {
  HOLD_IN: 'Hold Inbound',
  HOLD_OUT: 'Hold Outbound',
  HOLD_BOTH: 'Hold Both',
  HOLD_PERM: 'Hold Permanent',
};

/**
 * LII — Location ID Info. Read-only location lookup for all roles via a three-field
 * Aisle/Bin/Level entry (auto-advance) or a full barcode scan. Shows a pallet summary
 * when occupied. "Go to Pallet ID" and "Hold" navigate to PII/WLH. See
 * DevNotes/Screen-Specs/LII.md.
 */
export function LIIPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [locationId, setLocationId] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [entryKey, setEntryKey] = useState(0);

  /** Looks up a location (by 6- or 8-digit id) via the API and reconstructs the canonical 8-digit id from the resolved fields. */
  const loadLocation = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<LocationData>(`/api/locations/${id}`, token!);
      setLocation(data);
      // Reconstruct the canonical 8-digit id from the resolved fields rather than
      // trusting the input string — a 6-digit lookup (e.g. the demo button, which only
      // knows Aisle+Bin) would otherwise leave locationId level-ambiguous, and the Hold
      // endpoints require an exact 8-digit Aisle+Bin+Level id.
      setLocationId(
        String(data.aisle).padStart(3, '0') + String(data.bin).padStart(3, '0') + String(data.level).padStart(2, '0'),
      );
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Location not found' });
      setLocation(null);
      setLocationId(null);
      setEntryKey((k) => k + 1); // remounts LocationEntryFields, clearing its fields
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pre-population via ?id= (LiveId taps navigate to /location?id=<8-digit>).
  const idParam = searchParams.get('id');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?id= pre-population)
    if (idParam) void loadLocation(idParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  /** Navigates to PII for the location's occupying pallet. */
  function goToPallet() {
    if (!location?.pallet) return;
    navigate(`/pallet?id=${location.pallet.id}`);
  }

  /** Navigates to WLH for the currently loaded location. */
  function goToHold() {
    if (!locationId) return;
    navigate(`/hold?id=${locationId}`);
  }

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real location id from the API and looks it up, simulating a successful scan. */
  const demoScan = useCallback(async () => {
    try {
      const { locationId: id } = await apiFetch<{ locationId: string }>('/api/demo/location', token!);
      void loadLocation(id);
    } catch {
      setMessage({ type: 'error', text: 'Demo scan unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Looks up a location id that doesn't exist, simulating a not-found scan. */
  const demoBad = useCallback(() => void loadLocation('99999999'), [loadLocation]);

  /** Footer demo-button slot content: a good scan and a bad scan trigger. */
  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoScan} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        ✓ Scan Location
      </button>
      <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        ✗ Bad Location
      </button>
    </>
  ), [demoScan, demoBad]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-5 select-none">
      <LocationEntryFields key={entryKey} onResolved={loadLocation} />

      {loading && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {location && locationId && !loading && (
        <div className={`flex-1 flex flex-col overflow-y-auto ${location.pallet ? 'max-w-[1100px]' : 'max-w-[720px]'}`}>
          <div className="flex gap-8">
            <div className="flex-1 flex flex-col">
              <DataRow label="Location ID"><LiveId type="location" id={locationId} /></DataRow>
              <DataRow label="Aisle">{location.aisle}</DataRow>
              <DataRow label="Bin">{location.bin}</DataRow>
              <DataRow label="Level">{location.level}</DataRow>
              <DataRow label="Zone">{location.zone}</DataRow>
              <DataRow label="Size">{location.size}</DataRow>
              <DataRow label="Storage Code">{location.storageCode}</DataRow>
              <DataRow label="Status"><StatusBadge status={location.status} /></DataRow>
              <DataRow label="Hold">
                {location.holdCategory ? <StatusBadge status={HOLD_NAMES[location.holdCategory] ?? location.holdCategory} variant="danger" /> : 'None'}
              </DataRow>
            </div>

            {location.pallet && (
              <div className="flex-1 flex flex-col">
                <DataRow label="Pallet ID"><LiveId type="pallet" id={String(location.pallet.id)} /></DataRow>
                <DataRow label="DPCI"><LiveId type="dpci" id={location.pallet.dpci} /></DataRow>
                <DataRow label="Cartons">{location.pallet.cartons}</DataRow>
                <DataRow label="Pallets">{location.pallet.pallets}</DataRow>
                <DataRow label="SSPs">{location.pallet.ssps}</DataRow>
                <DataRow label="Pallet Status"><StatusBadge status={location.pallet.status} /></DataRow>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={goToPallet}
              disabled={!location.pallet}
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
