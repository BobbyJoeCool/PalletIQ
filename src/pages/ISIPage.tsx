import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { useNumpadField } from '../lib/useNumpadField';

interface LocationEntry {
  locationId: string;
  palletId: number;
}

/**
 * ISI — Item Storage Inquiry (issue #13). Worker enters a DPCI; every location currently
 * storing a pallet of that item is listed, ordered by location ID. Selecting a row enables
 * hot buttons to jump to that row's Location ID or Pallet ID screen. Read-only, no edit
 * capability — this is a lookup tool, same spirit as IID.
 */
export function ISIPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const navigate = useNavigate();

  // Same three-field Dept/Class/Item entry pattern as IID (issue #16) — auto-advances
  // Dept → Class → Item, then resolves once all three are filled. deptValueRef/
  // classValueRef hold the accumulated values live across the chain (see IIDPage.tsx's
  // identical pattern for why refs are needed instead of reading field.value directly).
  const deptField = useNumpadField('numpad', 3);
  const classField = useNumpadField('numpad', 2);
  const itemField = useNumpadField('numpad', 4);
  const deptValueRef = useRef('');
  const classValueRef = useRef('');

  const [locations, setLocations] = useState<LocationEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  /** Looks up every stored location for a DPCI via the API. */
  const loadByDpci = useCallback(async (dpci: string) => {
    // Populate the three display fields directly — callers that supply a whole DPCI at
    // once (demo buttons) otherwise leave the fields showing "—" despite a loaded result
    // (same fix as IIDPage.tsx's identical loadByDpci).
    const [d, c, i] = dpci.split('-');
    if (d != null && c != null && i != null) {
      deptField.set(d);
      classField.set(c);
      itemField.set(i);
    }
    setLoading(true);
    setSelected(null);
    try {
      const data = await apiFetch<{ locations: LocationEntry[] }>(`/api/items/dpci/${encodeURIComponent(dpci)}/locations`, token!);
      setLocations(data.locations);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      deptField.clear();
      classField.clear();
      itemField.clear();
      setLocations(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Toggles row selection — tapping the already-selected row deselects it. */
  function toggleSelect(palletId: number) {
    setSelected((s) => (s === palletId ? null : palletId));
  }

  const selectedEntry = locations?.find((l) => l.palletId === selected) ?? null;

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a real DPCI from the item catalogue and looks it up, simulating a scan (may return zero locations if that item isn't currently stored anywhere). */
  const demoScan = useCallback(async () => {
    try {
      const { dpci } = await apiFetch<{ dpci: string }>('/api/items/sample', token!);
      void loadByDpci(dpci);
    } catch {
      setMessage({ type: 'error', text: 'Demo scan unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Looks up a DPCI that doesn't exist, simulating a not-found scan. */
  const demoBad = useCallback(() => void loadByDpci('999-99-9999'), [loadByDpci]);

  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoScan} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        ✓ Scan DPCI
      </button>
      <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        ✗ Bad DPCI
      </button>
    </>
  ), [demoScan, demoBad]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      <div className="flex items-end gap-4">
        <div>
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">DPCI</span>
          <div className="flex items-center gap-2 mt-1">
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

      {locations && !loading && (
        <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px] border border-[#2A2A2A] rounded-[12px]">
          {locations.length === 0 ? (
            <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No locations currently storing this item</p>
          ) : (
            locations.map((l) => (
              <button
                type="button"
                key={l.palletId}
                onClick={() => toggleSelect(l.palletId)}
                className={`w-full flex items-center justify-between px-5 py-3 border-b border-[#1A1A1A] last:border-b-0 text-left transition-colors ${selected === l.palletId ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'}`}
              >
                <span className="font-data text-[20px] font-semibold text-white">{fmtLocation(l.locationId)}</span>
                <span className="font-data text-[16px] text-[#9A9A9A]">Pallet {l.palletId}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
