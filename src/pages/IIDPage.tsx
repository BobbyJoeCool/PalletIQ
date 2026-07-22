import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataRow } from '../components/shared/DataRow';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { type IIDItemData, useIID } from '../context/IIDContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { INVALID_WASH } from '../lib/invalidWash';
import { useNumpadField } from '../lib/useNumpadField';

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

  // DPCI entry is three separate fields (issue #16) instead of one combined field —
  // Dept auto-advances to Class, Class to Item, and Item auto-resolves the lookup once
  // all three are filled. deptValueRef/classValueRef hold the accumulated values live
  // across the chain — reading deptField.value/classField.value directly in
  // handleItemConfirm would see them frozen at mount time (the same stale-closure hazard
  // fixed in LocationEntryFields.tsx earlier this session), since this chain's handlers
  // are only ever registered once, at mount / on each preceding field's confirm.
  // padOnSubmit: typing "5" and hitting OK on Dept is accepted as "005" (same treatment
  // as every other fixed-width numeric code in the app — see LocationEntryFields).
  const deptField = useNumpadField('numpad', 3, true);
  const classField = useNumpadField('numpad', 2, true);
  const itemField = useNumpadField('numpad', 4, true);
  const upcField = useNumpadField('numpad');
  // Session-level persistence (App-Wide screen-persistence item, v1.7.0) — see
  // IIDContext.tsx's own doc comment; mirrors LII/PII/ISI's identical pattern.
  const { item, setItem } = useIID();
  const [loading, setLoading] = useState(false);
  const deptValueRef = useRef('');
  const classValueRef = useRef('');
  // Red-wash invalid state (App-Wide item 9, v1.7.0) — same DPCI-group/UPC-individual split
  // as ISI/PAR: DPCI is a composite existence lookup with no per-box check, UPC is its own
  // single box. Each lookup clears the *other* mode's invalid flag, since each lookup also
  // clears the other mode's field(s).
  const [dpciInvalid, setDpciInvalid] = useState(false);
  const [upcInvalid, setUpcInvalid] = useState(false);

  /** Looks up an item by DPCI via the API, clearing the UPC field on success. On failure, the bad DPCI stays visible in the three boxes (not cleared) so the worker can see what didn't resolve. */
  const loadByDpci = useCallback(async (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    // Populate the three display fields directly — the typed-entry chain already has them
    // filled by this point, but callers that supply a whole DPCI at once (demo buttons, the
    // ?dpci= URL param) otherwise leave the fields showing "—" despite a loaded item.
    const [d, c, i] = trimmed.split('-');
    if (d != null && c != null && i != null) {
      deptField.set(d);
      classField.set(c);
      itemField.set(i);
    }
    upcField.clear();
    setUpcInvalid(false);
    hidePanel();
    clearMessage();
    setLoading(true);
    try {
      const data = await apiFetch<IIDItemData>(`/api/items/dpci/${encodeURIComponent(trimmed)}`, token!);
      setItem(data);
      setDpciInvalid(false);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      setItem(null);
      setDpciInvalid(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hidePanel, clearMessage]);

  /** Looks up an item by UPC via the API, clearing the DPCI fields on success. On failure, the bad UPC stays visible (not cleared) so the worker can see what didn't resolve. */
  const loadByUpc = useCallback(async (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    upcField.set(trimmed);
    deptField.clear();
    classField.clear();
    itemField.clear();
    setDpciInvalid(false);
    hidePanel();
    clearMessage();
    setLoading(true);
    try {
      const data = await apiFetch<IIDItemData>(`/api/items/upc/${encodeURIComponent(trimmed)}`, token!);
      setItem(data);
      setUpcInvalid(false);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      setItem(null);
      setUpcInvalid(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hidePanel, clearMessage]);

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
    // Only ever focus Dept on mount — this screen doesn't reset/re-enter a "ready" state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-population via ?dpci= or ?upc= (issue #47 — DPCI/UPC chips elsewhere in the app
  // navigate here via LiveId, same pattern as LII/WLH/PII's ?id=).
  const dpciParam = searchParams.get('dpci');
  const upcParam = searchParams.get('upc');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?dpci=/?upc= pre-population)
    if (dpciParam) void loadByDpci(dpciParam);
    else if (upcParam) void loadByUpc(upcParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpciParam, upcParam]);

  /** Registers the UPC field's keyboard handler, wired to loadByUpc on confirm. */
  const focusUpcField = useCallback(() => upcField.focus(loadByUpc), [upcField, loadByUpc]);

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real DPCI/UPC from the API and looks it up, simulating a successful scan — targets whichever entry method (DPCI or UPC) currently has focus. */
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
