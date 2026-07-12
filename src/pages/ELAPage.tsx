import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CellValue } from '../components/shared/CellValue';
import { SizeField } from '../components/shared/SizeField';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { SIZES } from '../lib/sizes';

interface SizeCount {
  size: string;
  empty: number;
  staged: number;
}

interface AisleRow {
  aisle: number;
  totalEmpty: number;
  sizes: SizeCount[];
}

/**
 * ELA — Empty Locations by Aisle.
 * The GPMer's primary space-finding tool: filters by Storage Code + Size and sees, per
 * aisle, how many locations are empty (and how many are staged but not yet filled).
 * Selecting a result row activates "View Zone Map" (→ ELZ) and "Stage Aisle" (→ STG),
 * both pre-populated with the selected aisle. See DevNotes/Screen-Specs/ELA.md.
 */
export function ELAPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const navigate = useNavigate();

  const [storageCode, setStorageCode] = useState('');
  const [size, setSize] = useState('');
  const [rows, setRows] = useState<AisleRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  /** Applies a new Storage Code filter, clearing the current row selection. */
  const handleStorageCodeChange = useCallback((v: string) => {
    setStorageCode(v);
    setSelected(null);
  }, []);

  // Query trigger: auto-run once both fields have values. Selection is cleared by the field
  // handlers themselves (see handleStorageCodeChange and the Size <select> onChange) whenever
  // a filter changes, so this effect only needs to own the fetch lifecycle.
  useEffect(() => {
    if (!storageCode || !size) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data-fetch-on-filter-change effect
    setLoading(true);
    apiFetch<AisleRow[]>(
      `/api/locations/empty-by-aisle?storageCode=${encodeURIComponent(storageCode)}&size=${encodeURIComponent(size)}`,
      token!,
    )
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setMessage({ type: 'error', text: `Lookup failed — ${err instanceof Error ? err.message : 'please try again'}` });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storageCode, size, token, setMessage]);

  const selectedRow = rows?.find((r) => r.aisle === selected) ?? null;

  // Size columns are the union of every size actually present across all returned aisles
  // (each aisle now reports its full size breakdown, not just the queried size — issue #4),
  // in canonical SIZES order rather than API/Set insertion order.
  const sizeCols = useMemo(() => {
    const set = new Set<string>();
    rows?.forEach((r) => r.sizes.forEach((s) => set.add(s.size)));
    return SIZES.filter((s) => set.has(s));
  }, [rows]);

  /** Selects a result row, or deselects it if it's already the selected row. */
  function toggleRow(aisle: number) {
    setSelected((s) => (s === aisle ? null : aisle));
  }

  /** Navigates to ELZ, pre-populated with the selected row's aisle and the current Storage Code. */
  function viewZoneMap() {
    if (!selectedRow) return;
    navigate('/empty/zone', { state: { aisle: selectedRow.aisle, storageCode } });
  }

  /** Navigates to STG, pre-populated with the selected row's aisle, Storage Code, and Size. */
  function stageAisle() {
    if (!selectedRow) return;
    navigate('/stage', { state: { aisle: selectedRow.aisle, storageCode, size } });
  }

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      {/* Top bar: filter fields + navigation actions */}
      <div className="flex items-end justify-between gap-4 shrink-0">
        <div className="flex items-end gap-4">
          <StorageCodeField value={storageCode} onChange={handleStorageCodeChange} />
          <SizeField value={size} onChange={(v) => { setSize(v); setSelected(null); }} />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={viewZoneMap}
            disabled={!selectedRow}
            className="h-[64px] px-6 rounded-[12px] font-ui text-[18px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
          >
            View Zone Map
          </button>
          <button
            type="button"
            onClick={stageAisle}
            disabled={!selectedRow}
            className="h-[64px] px-6 rounded-[12px] font-ui text-[18px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
          >
            Stage Aisle
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-hidden flex flex-col border border-[#2A2A2A] rounded-[12px]">
        {!storageCode || !size ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#555]">
              Enter a Storage Code and select a Size to see available locations
            </p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#9A9A9A] animate-pulse">Loading…</p>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#555]">
              No empty or staged locations found for {storageCode} — {size}
            </p>
          </div>
        ) : (
          <>
            <div className="flex bg-[#111111] border-b border-[#2A2A2A] shrink-0">
              <div className="w-[140px] px-4 py-3">
                <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
                  Aisle
                </span>
              </div>
              {/* Subtle divider between size columns (issue #63) — border-l on every column
                  after the first also separates the size columns from the Aisle column. */}
              {sizeCols.map((s, i) => (
                <div key={s} className={`flex-1 px-4 py-3 text-center ${i > 0 ? 'border-l border-[#1F1F1F]' : ''}`}>
                  <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
                    {s}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {rows.map((row) => (
                <button
                  key={row.aisle}
                  type="button"
                  onClick={() => toggleRow(row.aisle)}
                  className={`flex w-full border-b border-[#1A1A1A] transition-colors ${
                    selected === row.aisle ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'
                  }`}
                >
                  <div className="w-[140px] px-4 py-3 text-left">
                    <span className="font-data text-[20px] font-semibold text-white">{row.aisle}</span>
                  </div>
                  {sizeCols.map((s, i) => {
                    const cell = row.sizes.find((sz) => sz.size === s);
                    return (
                      <div key={s} className={`flex-1 px-4 py-3 text-center ${i > 0 ? 'border-l border-[#1F1F1F]' : ''}`}>
                        {cell && <CellValue empty={cell.empty} staged={cell.staged} large />}
                      </div>
                    );
                  })}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
