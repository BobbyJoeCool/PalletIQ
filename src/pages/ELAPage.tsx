import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AisleSizeTable, type AisleSizeRow, type AisleSizeSort } from '../components/shared/AisleSizeTable';
import { SizeField } from '../components/shared/SizeField';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { SIZES } from '../lib/sizes';
import { useStorageCodes } from '../lib/useStorageCodes';

type AisleRow = AisleSizeRow;
type SortState = AisleSizeSort;

/**
 * ELA — Empty Locations by Aisle.
 * The GPMer's primary space-finding tool: filters by Storage Code (Size optional) and sees,
 * per aisle, how many locations are empty (and how many are staged but not yet filled).
 * Results are sortable by tapping the Aisle or any Size column header. Selecting a result
 * row activates "View Zone Map" (→ ELZ) and "Stage Aisle" (→ STG), both pre-populated with
 * the selected aisle. See DevNotes/Screen-Specs/ELA.md.
 */
export function ELAPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const navigate = useNavigate();
  const storageCodes = useStorageCodes();

  const [storageCode, setStorageCode] = useState('');
  const [size, setSize] = useState('');
  const [rows, setRows] = useState<AisleRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ column: 'aisle', direction: 'asc' });

  /** Applies a new Storage Code filter, clearing the current row selection. */
  const handleStorageCodeChange = useCallback((v: string) => {
    setStorageCode(v);
    setSelected(null);
  }, []);

  const storageDesc = useMemo(
    () => storageCodes?.find((c) => c.code === storageCode)?.desc ?? null,
    [storageCodes, storageCode],
  );
  // Only meaningful once the reference list has loaded — stays `false` (not yet flagged
  // invalid) while `storageCodes` is still `null`, so a code isn't wrongly flagged invalid
  // before the list has had a chance to arrive.
  const isInvalidCode = !!storageCode && storageCodes != null && storageDesc == null;
  // Size is a fixed static list (unlike Storage Code, no async reference fetch needed).
  const isInvalidSize = !!size && !SIZES.includes(size);

  // Query trigger: auto-run once Storage Code has a value (Size narrows further but is no
  // longer required — Storage-Code-only browsing). Selection is cleared by the field
  // handlers themselves whenever a filter changes, so this effect only needs to own the
  // fetch lifecycle plus the invalid-code guard.
  useEffect(() => {
    if (!storageCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results when the filter is emptied
      setRows(null);
      return;
    }
    if (isInvalidCode) {
      setRows(null);
      setMessage({ type: 'error', text: `Invalid Storage Code — ${storageCode}` });
      return;
    }
    if (isInvalidSize) {
      setRows(null);
      setMessage({ type: 'error', text: `Invalid Size — ${size}` });
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Default sort matches what was actually searched for: the queried size's own count
    // when one was given (so its column shows as already sorted), otherwise Aisle number.
    setSort(size ? { column: size, direction: 'desc' } : { column: 'aisle', direction: 'asc' });
    const qs = `storageCode=${encodeURIComponent(storageCode)}${size ? `&size=${encodeURIComponent(size)}` : ''}`;
    apiFetch<AisleRow[]>(`/api/locations/empty-by-aisle?${qs}`, token!)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setMessage({ type: 'error', text: `Lookup failed — ${err instanceof Error ? err.message : 'please try again'}` });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storageCode, size, isInvalidCode, isInvalidSize, token, setMessage]);

  const selectedRow = rows?.find((r) => r.aisle === selected) ?? null;

  /** Selects a result row, or deselects it if it's already the selected row. */
  function toggleRow(aisle: number) {
    setSelected((s) => (s === aisle ? null : aisle));
  }

  /** Sorts by the tapped column; tapping the already-active column flips its direction. */
  function handleSort(column: string) {
    setSort((prev) => (prev.column === column
      ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: column === 'aisle' ? 'asc' : 'desc' }));
  }

  /** Navigates to ELZ, pre-populated with the selected row's aisle and the current Storage Code. */
  function viewZoneMap() {
    if (!selectedRow) return;
    navigate('/empty/zone', { state: { aisle: selectedRow.aisle, storageCode } });
  }

  /** Navigates to STG, pre-populated with the selected row's aisle, Storage Code, and Size (if chosen). */
  function stageAisle() {
    if (!selectedRow) return;
    navigate('/stage', { state: { aisle: selectedRow.aisle, storageCode, ...(size ? { size } : {}) } });
  }

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      {/* Top bar: filter fields + navigation actions */}
      <div className="flex items-end justify-between gap-4 shrink-0">
        <div className="flex items-end gap-4">
          <StorageCodeField value={storageCode} onChange={handleStorageCodeChange} closeOnAutoSubmit />
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

      {/* "Displaying: {code} - {description}" banner — only once a real Storage Code is
          loaded, so the worker always knows what the table below is scoped to. */}
      {storageDesc != null && (
        <div className="shrink-0 py-2 text-center border-y border-[#2A2A2A]">
          <span className="font-ui text-[28px] font-bold text-white tracking-wide">
            Displaying {storageCode}: {storageDesc}
          </span>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-hidden flex flex-col border border-[#2A2A2A] rounded-[12px]">
        {!storageCode ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#555]">
              Enter a Storage Code to see available locations (add a Size to narrow further)
            </p>
          </div>
        ) : isInvalidCode ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#555]">Enter a valid Storage Code to see available locations</p>
          </div>
        ) : isInvalidSize ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#555]">Enter a valid Size to see available locations</p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#9A9A9A] animate-pulse">Loading…</p>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-ui text-[18px] text-[#555]">
              No empty or staged locations found for {storageCode}{size ? ` — ${size}` : ''}
            </p>
          </div>
        ) : (
          <AisleSizeTable rows={rows} sort={sort} onSortChange={handleSort} selected={selected} onSelectAisle={toggleRow} />
        )}
      </div>
    </div>
  );
}
