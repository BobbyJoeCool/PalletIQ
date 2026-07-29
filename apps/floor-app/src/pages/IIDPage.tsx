import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataRow } from '../components/shared/DataRow';
import { NumpadFieldBox } from '../components/shared/NumpadFieldBox';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { type IIDItemData, useIID } from '../context/IIDContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { INVALID_WASH } from '../lib/invalidWash';
import { useDpciFields } from '../lib/useDpciFields';
import { useUpcField } from '../lib/useUpcField';

// Item.vcp/Item.ssp do not exist on the actual data model — VCP/SSP are set per-pallet
// at receiving time, not fixed at the item level (see outline.md's Core Data Concepts,
// and api/prisma/schema.prisma's Item model). IID.md's read-only field table lists them
// anyway, which looks like a leftover from an earlier iteration of the data model. This
// screen displays the Item model's actual fields instead — see phase-9 log. The shape
// itself now lives in IIDContext.tsx (App-Wide screen-persistence, v1.7.0) as
// `IIDItemData`, imported here rather than redeclared.

/**
 * IID — Item ID Lookup. Read-only item lookup for all roles via two independent entry
 * fields (DPCI or UPC) — no edit capability, item data is managed outside this app.
 * See DevNotes/Screen-Specs/IID.md.
 */
export function IIDPage() {
  const { token, user } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // PAR (Pallet Reinstate) is IM+ only — same role check as PARPage.tsx itself. Gates the
  // "Reinstate Pallet" hot button below; PARPage independently re-enforces this on its own
  // side (Access Denied for sub-IM), so this is a UX convenience, not the actual gate.
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  // Session-level persistence (App-Wide screen-persistence item, v1.7.0) — see
  // IIDContext.tsx's own doc comment; mirrors LII/PII/ISI's identical pattern.
  const { item, setItem } = useIID();
  const [loading, setLoading] = useState(false);

  // Forward reference for dpciFields' onBeforeResolve (declared next) to clear the UPC
  // field — upcFields itself isn't declared until after dpciFields (its own
  // onBeforeResolve needs dpciFields.clear() already in scope), so this ref carries the
  // reverse direction. Kept current via the useEffect near upcFields' own declaration.
  // Same pattern as PARPage.tsx's focusVcpRef/clearUpcFieldRef.
  const clearUpcFieldRef = useRef(() => {});

  /** DPCI entry chain (issue #159, shared with PAR/ISI/PII's Edit mode) — looks up an
   *  item by DPCI, clearing the UPC field on resolve attempt. On failure, the bad DPCI
   *  stays visible in the three boxes (not cleared) so the worker can see what didn't
   *  resolve. */
  const dpciFields = useDpciFields<IIDItemData>({
    fetch: useCallback((digits) => apiFetch<IIDItemData>(`/api/items/dpci/${digits}`, token!), [token]),
    onBeforeResolve: useCallback(() => {
      clearUpcFieldRef.current();
      hidePanel();
      clearMessage();
      setLoading(true);
    }, [hidePanel, clearMessage]),
    onResolved: useCallback((data) => {
      setItem(data);
      setLoading(false);
    }, [setItem]),
    onNotFound: useCallback(() => {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      setItem(null);
      setLoading(false);
    }, [setMessage, setItem]),
  });
  const { deptField, classField, itemField, dpciInvalid, focusDeptField, focusClassField, focusItemField } = dpciFields;

  /** UPC entry field (issue #160, shared with ISI/PAR) — looks up an item by UPC,
   *  clearing the DPCI fields on resolve attempt. On failure, the bad UPC stays visible
   *  (not cleared) so the worker can see what didn't resolve. */
  const upcFields = useUpcField<IIDItemData>({
    fetch: useCallback((upc) => apiFetch<IIDItemData>(`/api/items/upc/${encodeURIComponent(upc)}`, token!), [token]),
    onBeforeResolve: useCallback(() => {
      dpciFields.clear();
      hidePanel();
      clearMessage();
      setLoading(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hidePanel, clearMessage]),
    onResolved: useCallback((data) => {
      setItem(data);
      setLoading(false);
    }, [setItem]),
    onNotFound: useCallback(() => {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      setItem(null);
      setLoading(false);
    }, [setMessage, setItem]),
  });
  useEffect(() => { clearUpcFieldRef.current = upcFields.clear; });

  useEffect(() => {
    const id = setTimeout(() => focusDeptField(), 50);
    return () => clearTimeout(id);
    // Only ever focus Dept on mount — this screen doesn't reset/re-enter a "ready" state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-population via ?dpci= or ?upc= (issue #47 — DPCI/UPC chips elsewhere in the app
  // navigate here via LiveId, same pattern as LII/WLH/PII's ?id=).
  const dpciParam = searchParams.get('dpci');
  const upcParam = searchParams.get('upc');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?dpci=/?upc= pre-population)
    if (dpciParam) dpciFields.loadDpci(dpciParam);
    else if (upcParam) upcFields.loadUpc(upcParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpciParam, upcParam]);

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real DPCI/UPC from the API and looks it up, simulating a successful scan — targets whichever entry method (DPCI or UPC) currently has focus. */
  const demoScan = useCallback(async () => {
    try {
      const data = await apiFetch<{ dpci: string; upc: string }>('/api/items/sample', token!);
      if (upcFields.field.isActive) upcFields.loadUpc(data.upc);
      else dpciFields.loadDpci(data.dpci);
    } catch {
      setMessage({ type: 'error', text: 'Demo scan unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, upcFields.field.isActive]);

  /** Looks up a DPCI/UPC that doesn't exist, simulating a not-found scan — targets whichever entry method currently has focus. */
  const demoBad = useCallback(
    () => (upcFields.field.isActive ? upcFields.loadUpc('999999999999') : dpciFields.loadDpci('999-99-9999')),
    [upcFields.field.isActive], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Footer demo-button slot content: a good scan and a bad scan trigger. Labels switch to "...UPC" whenever the UPC field has focus, matching demoScan/demoBad's own targeting. */
  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoScan} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        {upcFields.field.isActive ? '✓ Scan UPC' : '✓ Scan DPCI'}
      </button>
      <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        {upcFields.field.isActive ? '✗ Bad UPC' : '✗ Bad DPCI'}
      </button>
    </>
  ), [demoScan, demoBad, upcFields.field.isActive]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      <div className="flex gap-4">
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
        <NumpadFieldBox
          label="UPC"
          value={upcFields.field.value}
          onFocus={upcFields.focusField}
          active={upcFields.field.isActive}
          invalid={upcFields.upcInvalid}
          width="w-[260px]"
          boxClass="h-[64px] px-5 rounded-[12px]"
          valueClass="text-[26px] font-medium"
          caretClass="w-[2px] h-[28px]"
        />
      </div>

      {loading && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {item && !loading && (
        <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px] gap-4">
          <div className="flex flex-col">
            <DataRow label="DPCI">{item.dpci}</DataRow>
            <DataRow label="UPC">{item.upc}</DataRow>
            <DataRow label="Name">{item.name}</DataRow>
            <DataRow label="Short Description">{item.descShort}</DataRow>
            <DataRow label="Description">{item.desc}</DataRow>
            <DataRow label="Retail Price">${item.retailPrice.toFixed(2)}</DataRow>
            <DataRow label="Cost">${item.cost.toFixed(2)}</DataRow>
            <DataRow label="Unit Weight">{item.unitWeight != null ? `${item.unitWeight.toFixed(2)} lbs` : '—'}</DataRow>
            <DataRow label="Storage Code">{item.storageCode}</DataRow>
            <DataRow label="Conveyable">{item.conveyable ? 'Yes' : 'No'}</DataRow>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/storage-inquiry?dpci=${item.dpci}`)}
              className="self-start h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#003366] hover:bg-[#004488] text-white transition-colors"
            >
              View Storage Locations
            </button>
            {isIM && (
              <button
                type="button"
                onClick={() => navigate(`/pallet/reinstate?dpci=${item.dpci}`)}
                className="self-start h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#003366] hover:bg-[#004488] text-white transition-colors"
              >
                Reinstate Pallet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
