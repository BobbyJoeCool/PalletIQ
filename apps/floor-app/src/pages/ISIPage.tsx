import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ItemDemoScannerBar } from '../components/shared/ItemDemoScannerBar';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import type { ISILocationEntry, ISISearchState } from '../context/ISIContext';
import { useISI } from '../context/ISIContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { fmtLocation } from '../lib/fmt';
import { useDpciFields } from '../lib/useDpciFields';
import { useUpcField } from '../lib/useUpcField';
import { UpcField } from '../components/shared/UpcField';
import { DpciEntry } from '../components/shared/DpciEntry';
import { ItemDescription } from '../components/shared/ItemDescription';

interface LocationsResponse {
  dpci: string;
  descShort: string;
  locations: ISILocationEntry[];
}

/**
 * ISI — Item Storage Inquiry (issue #13). Worker enters a DPCI or a UPC; every location
 * currently storing a pallet of that item is listed, ordered by location ID. Selecting a
 * row enables hot buttons to jump to that row's Location ID or Pallet ID screen. Read-only,
 * no edit capability — this is a lookup tool, same spirit as IID.
 *
 * Search state (query + results + selection) lives in ISIContext, not local state, so
 * navigating away and back restores the last search (fix-list item 01) instead of
 * resetting to an empty entry screen.
 */
export function ISIPage() {
  const { token } = useAuth();
  const { clearMessage, showError } = useMessageBar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { search, setSearch } = useISI();

  const [loading, setLoading] = useState(false);

  const locations = search?.locations ?? null;
  const selected = search?.selected ?? null;

  // Forward reference for dpciFields' onBeforeResolve (declared next) to clear the UPC
  // field — same pattern as IIDPage.tsx/PARPage.tsx's identical forward-reference need.
  const clearUpcFieldRef = useRef(() => {});

  /** DPCI entry chain (issue #159, shared with PAR/IID/PII's Edit mode) — looks up every
   *  stored location for a DPCI. On failure, the bad DPCI stays visible in the three boxes
   *  (not cleared) so the worker can see what didn't resolve. */
  const dpciFields = useDpciFields<LocationsResponse>({
    fetch: useCallback((dpci) => apiFetch<LocationsResponse>(`/api/items/dpci/${dpci}/locations`, token!), [token]),
    onBeforeResolve: useCallback(() => {
      clearUpcFieldRef.current();
      clearMessage();
      setLoading(true);
    }, [clearMessage]),
    onResolved: useCallback((data, dpci) => {
      setSearch({ mode: 'dpci', query: dpci, descShort: data.descShort, locations: data.locations, selected: null });
      setLoading(false);
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
    onNotFound: useCallback(() => {
      showError('Item not found');
      setSearch(null);
      setLoading(false);
    }, [showError]), // eslint-disable-line react-hooks/exhaustive-deps
  });
  const { focusDeptField } = dpciFields;

  /** UPC entry field (issue #160, shared with IID/PAR) — looks up every stored location
   *  for a UPC (fix-list item 02), then backfills the DPCI boxes with the resolved item's
   *  own DPCI (asymmetric with the reverse direction — DPCI entry still clears UPC below,
   *  matching PAR's own already-established rule, now the universal convention for this
   *  hook pairing; see useUpcField's own doc comment). On failure, the bad UPC stays
   *  visible (not cleared) so the worker can see what didn't resolve. */
  const upcFields = useUpcField<LocationsResponse>({
    fetch: useCallback((upc) => apiFetch<LocationsResponse>(`/api/items/upc/${encodeURIComponent(upc)}/locations`, token!), [token]),
    onBeforeResolve: useCallback(() => {
      clearMessage();
      setLoading(true);
    }, [clearMessage]),
    onResolved: useCallback((data, upc) => {
      setSearch({ mode: 'upc', query: upc, descShort: data.descShort, locations: data.locations, selected: null });
      dpciFields.setFromDpci(data.dpci);
      setLoading(false);
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
    onNotFound: useCallback(() => {
      showError('Item not found');
      setSearch(null);
      setLoading(false);
    }, [showError]), // eslint-disable-line react-hooks/exhaustive-deps
  });
  useEffect(() => { clearUpcFieldRef.current = upcFields.clear; });


  useEffect(() => {
    const id = setTimeout(() => focusDeptField(), 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-population via ?dpci=/?upc= (same pattern as IID — e.g. IID's "View Storage
  // Locations" button navigates here with ?dpci=), or, absent either param, restoring the
  // display boxes from a search already sitting in ISIContext (returning from another
  // screen) without re-running the fetch.
  const dpciParam = searchParams.get('dpci');
  const upcParam = searchParams.get('upc');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?dpci=/?upc= pre-population), same as IIDPage's identical pattern
    if (dpciParam) dpciFields.loadDpci(dpciParam);
    else if (upcParam) upcFields.loadUpc(upcParam);
    else if (search) {
      if (search.mode === 'dpci') dpciFields.setFromDpci(search.query);
      else upcFields.field.set(search.query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpciParam, upcParam]);

  /** Toggles row selection — tapping the already-selected row deselects it. */
  function toggleSelect(palletId: number) {
    if (!search) return;
    const next: ISISearchState = { ...search, selected: search.selected === palletId ? null : palletId };
    setSearch(next);
  }

  const selectedEntry = locations?.find((l) => l.palletId === selected) ?? null;

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Footer demo-button slot: DPCI/UPC's Feature 9 Demo Scanner, targeting whichever entry
   *  method (DPCI or UPC) currently has focus — same targeting `demoScan`/`demoBad` used
   *  before this component replaced them. */
  const demoSlot = useMemo(() => (
    upcFields.field.isActive
      ? <ItemDemoScannerBar idType="upc" onFill={upcFields.loadUpc} />
      : <ItemDemoScannerBar idType="dpci" onFill={dpciFields.loadDpci} />
  ), [upcFields.field.isActive, upcFields.loadUpc, dpciFields.loadDpci]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      <div className="flex items-end gap-4">
        <div>
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">DPCI</span>
          <div className="mt-1">
            <DpciEntry
              fields={dpciFields}
              widths={['w-[100px]', 'w-[80px]', 'w-[110px]']}
              boxClass="h-[64px] px-3 rounded-[12px]"
              valueClass="text-[26px] font-medium"
              caretClass="w-[2px] h-[28px]"
              centered
              separatorClass="text-[#555] text-[22px]"
            />
          </div>
        </div>

        <UpcField fields={upcFields}
          label="UPC"
          width="w-[260px]"
          boxClass="h-[64px] px-5 rounded-[12px]"
          valueClass="text-[26px] font-medium"
          caretClass="w-[2px] h-[28px]"
        />

        {selectedEntry && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/location?id=${selectedEntry.locationId}`)}
              className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#003366] hover:bg-[#004488] text-white transition-colors"
            >
              Go to Location ID
            </button>
            <button
              type="button"
              onClick={() => navigate(`/pallet?id=${selectedEntry.palletId}`)}
              className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#003366] hover:bg-[#004488] text-white transition-colors"
            >
              Go to Pallet ID
            </button>
          </div>
        )}
      </div>

      {loading && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {search && !loading && (
        <div className="max-w-[720px]"><ItemDescription value={search.descShort} /></div>
      )}

      {locations && !loading && (
        <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px] border border-[#2A2A2A] rounded-[12px]">
          {locations.length === 0 ? (
            <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No locations currently storing this item</p>
          ) : (
            <>
              {/* Column headers — same grid template as each row below so values line up
                  underneath their label like a real table, rather than each row spacing its
                  own three text nodes independently (the old flex justify-between produced an
                  inconsistent left/center/right look row-to-row). No vertical divider lines
                  between columns — spacing alone (gap-x-4) separates them. Sticky within the
                  scrollable list (sticky + top-0 relative to the overflow-y-auto container
                  above) with an opaque background so rows scrolling underneath don't show
                  through, and a border to visually separate it from the row it's stuck above. */}
              <div className="sticky top-0 z-10 grid grid-cols-[180px_1fr_140px] gap-x-4 gap-y-0.5 px-5 pt-2 pb-1 bg-[#0A0A0A] border-b border-[#2A2A2A] font-ui text-[11px] font-semibold text-[#666] uppercase tracking-wider">
                <span>Location</span>
                <span />
                <span>Storage-Size</span>
                <span>Pallet ID</span>
                <span>Pallets · Cartons · SSPs</span>
                <span>VCP / SSP</span>
              </div>
              {locations.map((l) => (
                <button
                  type="button"
                  key={l.palletId}
                  onClick={() => toggleSelect(l.palletId)}
                  className={`w-full grid grid-cols-[180px_1fr_140px] gap-x-4 gap-y-1 items-baseline px-5 py-3 border-b border-[#1A1A1A] last:border-b-0 text-left transition-colors ${selected === l.palletId ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'}`}
                >
                  <span className="font-data text-[20px] font-semibold text-white">{fmtLocation(l.locationId)}</span>
                  <span />
                  <span className="font-data text-[16px] text-[#9A9A9A]">{l.storageCode}-{l.size}</span>

                  <span className="font-data text-[16px] text-[#9A9A9A]">Pallet {l.palletId}</span>
                  <span className="font-data text-[15px] text-[#9A9A9A]">{l.currentPallets} · {l.currentCartons} · {l.currentSSPs}</span>
                  <span className="font-data text-[15px] text-[#9A9A9A]">{l.vcp} / {l.ssp}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
