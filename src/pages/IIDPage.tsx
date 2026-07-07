import { useCallback, useMemo, useState } from 'react';
import { DataRow } from '../components/shared/DataRow';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { useNumpadField } from '../lib/useNumpadField';

// Item.vcp/Item.ssp do not exist on the actual data model — VCP/SSP are set per-pallet
// at receiving time, not fixed at the item level (see outline.md's Core Data Concepts,
// and api/prisma/schema.prisma's Item model). IID.md's read-only field table lists them
// anyway, which looks like a leftover from an earlier iteration of the data model. This
// screen displays the Item model's actual fields instead — see phase-9 log.
interface ItemData {
  dept: number;
  class: number;
  item: number;
  dpci: string;
  upc: string;
  name: string;
  desc: string;
  descShort: string;
  retailPrice: number;
  cost: number;
  packingZoneCode: number;
  storageCode: string;
  conveyable: boolean;
}

/**
 * IID — Item ID Lookup. Read-only item lookup for all roles via two independent entry
 * fields (DPCI or UPC) — no edit capability, item data is managed outside this app.
 * See DevNotes/Screen-Specs/IID.md.
 */
export function IIDPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel } = useNumpad();

  const dpciField = useNumpadField('numpad');
  const upcField = useNumpadField('keyboard');
  const [item, setItem] = useState<ItemData | null>(null);
  const [loading, setLoading] = useState(false);

  /** Looks up an item by DPCI via the API, clearing the UPC field on success (or the DPCI field on failure). */
  const loadByDpci = useCallback(async (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    dpciField.set(trimmed);
    upcField.clear();
    hidePanel();
    setLoading(true);
    try {
      const data = await apiFetch<ItemData>(`/api/items/dpci/${encodeURIComponent(trimmed)}`, token!);
      setItem(data);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      dpciField.clear();
      setItem(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hidePanel]);

  /** Looks up an item by UPC via the API, clearing the DPCI field on success (or the UPC field on failure). */
  const loadByUpc = useCallback(async (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    upcField.set(trimmed);
    dpciField.clear();
    hidePanel();
    setLoading(true);
    try {
      const data = await apiFetch<ItemData>(`/api/items/upc/${encodeURIComponent(trimmed)}`, token!);
      setItem(data);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Item not found' });
      upcField.clear();
      setItem(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hidePanel]);

  /** Registers the DPCI field's numpad handler, wired to loadByDpci on confirm. */
  const focusDpciField = useCallback(() => dpciField.focus(loadByDpci), [dpciField, loadByDpci]);
  /** Registers the UPC field's keyboard handler, wired to loadByUpc on confirm. */
  const focusUpcField = useCallback(() => upcField.focus(loadByUpc), [upcField, loadByUpc]);

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real DPCI from the API and looks it up, simulating a successful scan. */
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

  /** Footer demo-button slot content: a good scan and a bad scan trigger. */
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
      <div className="flex gap-4">
        <div className="w-[260px]">
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">DPCI</span>
          <button
            type="button"
            onClick={focusDpciField}
            className={`flex items-center h-[64px] w-full px-5 mt-1 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${dpciField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
          >
            <span className="font-data text-[26px] font-medium text-white">
              {dpciField.value || <span className="text-[#444]">—</span>}
            </span>
            {dpciField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
          </button>
        </div>
        <div className="w-[260px]">
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">UPC</span>
          <button
            type="button"
            onClick={focusUpcField}
            className={`flex items-center h-[64px] w-full px-5 mt-1 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${upcField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
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
        <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px]">
          <DataRow label="DPCI">{item.dpci}</DataRow>
          <DataRow label="UPC">{item.upc}</DataRow>
          <DataRow label="Name">{item.name}</DataRow>
          <DataRow label="Short Description">{item.descShort}</DataRow>
          <DataRow label="Description">{item.desc}</DataRow>
          <DataRow label="Retail Price">${item.retailPrice.toFixed(2)}</DataRow>
          <DataRow label="Cost">${item.cost.toFixed(2)}</DataRow>
          <DataRow label="Storage Code">{item.storageCode}</DataRow>
          <DataRow label="Conveyable">{item.conveyable ? 'Yes' : 'No'}</DataRow>
        </div>
      )}
    </div>
  );
}
