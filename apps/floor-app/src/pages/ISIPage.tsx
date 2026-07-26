import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import type { ISILocationEntry, ISISearchState } from '../context/ISIContext';
import { useISI } from '../context/ISIContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { INVALID_WASH } from '../lib/invalidWash';
import { useNumpadField } from '../lib/useNumpadField';

interface LocationsResponse {
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
  const { setMessage, clearMessage } = useMessageBar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { search, setSearch } = useISI();

  // Same three-field Dept/Class/Item entry pattern as IID (issue #16) — auto-advances
  // Dept → Class → Item, then resolves once all three are filled. deptValueRef/
  // classValueRef hold the accumulated values live across the chain (see IIDPage.tsx's
  // identical pattern for why refs are needed instead of reading field.value directly).
  // padOnSubmit: typing "5" and hitting OK on Dept is accepted as "005" (same treatment
  // as every other fixed-width numeric code in the app — see LocationEntryFields).
  const deptField = useNumpadField('numpad', 3, true);
  const classField = useNumpadField('numpad', 2, true);
  const itemField = useNumpadField('numpad', 4, true);
  // UPC is numeric-only, so it opens the Numpad rather than the full Keyboard (same
  // reasoning as IID's own UPC field — issue #56).
  const upcField = useNumpadField('numpad');
  const deptValueRef = useRef('');
  const classValueRef = useRef('');

  const [loading, setLoading] = useState(false);
  // Red-wash invalid state (App-Wide item 9, v1.7.0) — DPCI is a single composite existence
  // lookup with no per-box check, so it group-washes (same reasoning as PAR's DPCI); UPC is
  // its own single box, so it washes individually. Mirrors PAR's loadByDpci/loadByUpc
  // precedent exactly: each lookup clears the *other* field's invalid flag (since each
  // lookup also clears the other field's boxes), sets its own flag false on success and
  // true on failure.
  const [dpciInvalid, setDpciInvalid] = useState(false);
  const [upcInvalid, setUpcInvalid] = useState(false);

  const locations = search?.locations ?? null;
  const selected = search?.selected ?? null;

  /** Populates the three DPCI display boxes from a dash-joined string — callers that supply a whole DPCI at once (demo buttons, deep links, context restore) otherwise leave the boxes on their "—" placeholders. */
  const populateDpciBoxes = useCallback((dpci: string) => {
    const [d, c, i] = dpci.split('-');
    if (d != null && c != null && i != null) {
      deptField.set(d);
      classField.set(c);
      itemField.set(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Looks up every stored location for a DPCI via the API. On failure, the bad DPCI stays visible in the three boxes (not cleared) so the worker can see what didn't resolve. */
  const loadByDpci = useCallback(async (dpci: string) => {
    populateDpciBoxes(dpci);
    upcField.clear();
    setUpcInvalid(false);
    clearMessage();
    setLoading(true);
    try {
      const data = await apiFetch<LocationsResponse>(`/api/items/dpci/${encodeURIComponent(dpci)}/locations`, token!);
      setSearch({ mode: 'dpci', query: dpci, descShort: data.descShort, locations: data.locations, selected: null });
      setDpciInvalid(false);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      setSearch(null);
      setDpciInvalid(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clearMessage]);

  /** Looks up every stored location for a UPC via the API (fix-list item 02). On failure, the bad UPC stays visible (not cleared) so the worker can see what didn't resolve. */
  const loadByUpc = useCallback(async (upc: string) => {
    const trimmed = upc.trim();
    if (!trimmed) return;
    upcField.set(trimmed);
    deptField.clear();
    classField.clear();
    itemField.clear();
    setDpciInvalid(false);
    clearMessage();
    setLoading(true);
    try {
      const data = await apiFetch<LocationsResponse>(`/api/items/upc/${encodeURIComponent(trimmed)}/locations`, token!);
      setSearch({ mode: 'upc', query: trimmed, descShort: data.descShort, locations: data.locations, selected: null });
      setUpcInvalid(false);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      setSearch(null);
      setUpcInvalid(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clearMessage]);

  /** Registers the Dept field's numpad handler; on confirm (3 digits), advances to Class. */
  function focusDeptField() {
    deptField.focus(handleDeptConfirm);
  }
  /** Registers the Class field's numpad handler; on confirm (2 digits), advances to Item. */
  function focusClassField() {
    classField.focus(handleClassConfirm);
  }
  /** Registers the Item field's numpad handler; on confirm (4 digits), resolves the full DPCI lookup. */
  function focusItemField() {
    itemField.focus(handleItemConfirm);
  }
  /** Registers the UPC field's numpad handler, wired to loadByUpc on confirm. */
  const focusUpcField = useCallback(() => upcField.focus(loadByUpc), [upcField, loadByUpc]);

  /** Dept field submit: records the value and advances to Class once exactly 3 digits are entered. */
  function handleDeptConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 3) return;
    deptValueRef.current = v;
    setTimeout(() => focusClassField(), 50);
  }

  /** Class field submit: records the value and advances to Item once exactly 2 digits are entered. */
  function handleClassConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 2) return;
    classValueRef.current = v;
    setTimeout(() => focusItemField(), 50);
  }

  /** Item field submit: once exactly 4 digits are entered, combines Dept+Class+Item and resolves the lookup. */
  function handleItemConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 4) return;
    void loadByDpci(`${deptValueRef.current}-${classValueRef.current}-${v}`);
  }

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
    if (dpciParam) void loadByDpci(dpciParam);
    else if (upcParam) void loadByUpc(upcParam);
    else if (search) {
      if (search.mode === 'dpci') populateDpciBoxes(search.query);
      else upcField.set(search.query);
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

  /** Fetches a real DPCI/UPC from the item catalogue and looks it up, simulating a scan (may legitimately return zero locations) — targets whichever entry method (DPCI or UPC) currently has focus. */
  const demoScan = useCallback(async () => {
    try {
      const data = await apiFetch<{ dpci: string; upc: string }>('/api/items/sample', token!);
      if (upcField.isActive) void loadByUpc(data.upc);
      else void loadByDpci(data.dpci);
    } catch {
      setMessage({ type: 'error', text: 'Demo scan unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, upcField.isActive]);

  /** Looks up a DPCI/UPC that doesn't exist, simulating a not-found scan — targets whichever entry method currently has focus. */
  const demoBad = useCallback(
    () => (upcField.isActive ? void loadByUpc('999999999999') : void loadByDpci('999-99-9999')),
    [upcField.isActive, loadByDpci, loadByUpc],
  );

  /** Footer demo-button slot content: a good scan and a bad scan trigger. Labels switch to "...UPC" whenever the UPC field has focus, matching demoScan/demoBad's own targeting. */
  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoScan} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        {upcField.isActive ? '✓ Scan UPC' : '✓ Scan DPCI'}
      </button>
      <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        {upcField.isActive ? '✗ Bad UPC' : '✗ Bad DPCI'}
      </button>
    </>
  ), [demoScan, demoBad, upcField.isActive]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      <div className="flex items-end gap-4">
        <div>
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">DPCI</span>
          <div className={`flex items-center gap-2 mt-1 rounded-[12px] ${dpciInvalid ? `${INVALID_WASH} border-2 p-1` : ''}`}>
            <button
              type="button"
              aria-label="Dept"
              onClick={focusDeptField}
              className={`flex items-center justify-center h-[64px] w-[100px] px-3 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${deptField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
            >
              <span className="font-data text-[26px] font-medium text-white">
                {deptField.value || <span className="text-[#444]">—</span>}
              </span>
              {deptField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
            </button>
            <span className="text-[#555] text-[22px]">-</span>
            <button
              type="button"
              aria-label="Class"
              onClick={focusClassField}
              className={`flex items-center justify-center h-[64px] w-[80px] px-3 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${classField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
            >
              <span className="font-data text-[26px] font-medium text-white">
                {classField.value || <span className="text-[#444]">—</span>}
              </span>
              {classField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
            </button>
            <span className="text-[#555] text-[22px]">-</span>
            <button
              type="button"
              aria-label="Item"
              onClick={focusItemField}
              className={`flex items-center justify-center h-[64px] w-[110px] px-3 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${itemField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
            >
              <span className="font-data text-[26px] font-medium text-white">
                {itemField.value || <span className="text-[#444]">—</span>}
              </span>
              {itemField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
            </button>
          </div>
        </div>

        <div className="w-[260px]">
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">UPC</span>
          <button
            type="button"
            onClick={focusUpcField}
            className={`flex items-center h-[64px] w-full px-5 mt-1 rounded-[12px] border-2 transition-colors ${
              upcInvalid ? INVALID_WASH : upcField.isActive ? 'border-[#CC0000] bg-[#0D0D0D]' : 'border-[#3A3A3A] bg-[#0D0D0D] hover:border-[#555]'
            }`}
          >
            <span className="font-data text-[26px] font-medium text-white">
              {upcField.value || <span className="text-[#444]">—</span>}
            </span>
            {upcField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
          </button>
        </div>

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
        <p className="font-data text-[26px] font-medium text-white max-w-[720px]">{search.descShort}</p>
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
