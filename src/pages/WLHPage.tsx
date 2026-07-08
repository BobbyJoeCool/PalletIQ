import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HoldPanel } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';

/**
 * WLH — Warehouse Location Hold. Same three-field Aisle/Bin/Level entry pattern as LII;
 * once a location is resolved, renders the shared HoldPanel (place/replace/remove).
 * Accessible from Home, HotJump, LII's "Hold" button, or the quick-hold panels on
 * PIP/SDP/MNP (which render HoldPanel directly rather than navigating here). See
 * DevNotes/Screen-Specs/WLH.md.
 */
export function WLHPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const [searchParams] = useSearchParams();

  const [locationId, setLocationId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [entryKey, setEntryKey] = useState(0);

  /** Looks up a location (by 6- or 8-digit id) via the API and reconstructs the canonical 8-digit id from the resolved fields. */
  const resolveLocation = useCallback(async (id: string) => {
    setChecking(true);
    try {
      const data = await apiFetch<{ aisle: number; bin: number; level: number }>(`/api/locations/${id}`, token!);
      // Reconstruct the canonical 8-digit id from the resolved fields — a 6-digit lookup
      // (the demo button only knows Aisle+Bin) would otherwise leave locationId
      // level-ambiguous, and the Hold endpoints require an exact 8-digit id.
      setLocationId(
        String(data.aisle).padStart(3, '0') + String(data.bin).padStart(3, '0') + String(data.level).padStart(2, '0'),
      );
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Location not found' });
      setLocationId(null);
      setEntryKey((k) => k + 1);
    } finally {
      setChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pre-population via ?id= (LII's "Hold" button, or a future quick-hold navigation).
  const idParam = searchParams.get('id');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?id= pre-population)
    if (idParam) void resolveLocation(idParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real location id from the API and resolves it, simulating a successful scan. */
  const demoLoad = useCallback(async () => {
    try {
      const { locationId: id } = await apiFetch<{ locationId: string }>('/api/demo/location', token!);
      void resolveLocation(id);
    } catch {
      setMessage({ type: 'error', text: 'Demo load unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Looks up a location id that doesn't exist, simulating a not-found scan. */
  const demoBad = useCallback(() => void resolveLocation('99999999'), [resolveLocation]);

  /** Footer demo-button slot content: a good load and a bad location trigger. */
  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoLoad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        ✓ Load Location
      </button>
      <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        ✗ Bad Location
      </button>
    </>
  ), [demoLoad, demoBad]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-5 select-none">
      <LocationEntryFields key={entryKey} onResolved={resolveLocation} />

      {checking && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {locationId && !checking && (
        <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px] gap-4">
          <div className="flex items-center gap-3">
            <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">Location</span>
            <LiveId type="location" id={locationId} className="!text-[28px] !font-bold" />
          </div>
          <HoldPanel locationId={locationId} />
        </div>
      )}
    </div>
  );
}
