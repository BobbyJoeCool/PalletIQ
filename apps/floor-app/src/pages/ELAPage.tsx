import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AisleSizeTable, type AisleSizeRow, type AisleSizeSort } from '../components/shared/AisleSizeTable';
import { NumpadFieldBox } from '../components/shared/NumpadFieldBox';
import { SizeField } from '../components/shared/SizeField';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { WorkstationField } from '../components/shared/WorkstationField';
import { useAuth } from '../context/AuthContext';
import { useELA } from '../context/ELAContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { type AisleBreakdownEntry, useAisleField } from '../lib/useAisleField';
import { useStorageCodes } from '../lib/useStorageCodes';
import { useWorkstations, type Workstation } from '../lib/useWorkstations';

type AisleRow = AisleSizeRow;
type SortState = AisleSizeSort;

/**
 * GitHub #125 — a toggleable filter chip (grey/black off, blue 50%-transparent on,
 * matching the app's existing OverrideToggle visual language) with a dropdown popup
 * listing each workstation as a bubble a worker taps to mark it for exclusion (red =
 * excluded). The chip's own on/off state is independent of which workstations are
 * marked — turning it off disables the exclusion without losing the marked set.
 */
function WorkstationExcludeFilter({
  active, onToggleActive, excluded, onToggleExcluded, workstations,
}: {
  active: boolean;
  onToggleActive: () => void;
  excluded: string[];
  onToggleExcluded: (id: string) => void;
  workstations: Workstation[] | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Tap-outside closes the popup — same lightweight-anchored-dropdown behavior as
  // CodePickerField's own popup.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative flex items-stretch gap-1">
      <button
        type="button"
        onClick={onToggleActive}
        aria-pressed={active}
        className={`h-[64px] px-5 rounded-[12px] border-2 font-ui text-[15px] font-semibold uppercase tracking-wide transition-colors ${
          active ? 'border-[#3A6BB0] bg-[#3A6BB080] text-white' : 'border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white'
        }`}
      >
        Exclude Workstations{excluded.length > 0 ? ` (${excluded.length})` : ''}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Exclude Workstations options"
        className={`shrink-0 w-[40px] h-[64px] rounded-[12px] border-2 flex items-center justify-center transition-colors ${
          open ? 'border-[#CC0000] text-white' : 'border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555] hover:text-white'
        }`}
      >
        <span className="text-[13px]">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 w-max max-w-[420px] max-h-[320px] overflow-y-auto bg-[#0D0D0D] border border-[#3A3A3A] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-3">
          {workstations == null ? (
            <p className="font-ui text-[13px] text-[#9A9A9A] px-2 py-2 animate-pulse">Loading…</p>
          ) : workstations.length === 0 ? (
            <p className="font-ui text-[13px] text-[#555] px-2 py-2">No workstations available</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {workstations.map((w) => {
                const isExcluded = excluded.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onToggleExcluded(w.id)}
                    title={w.name}
                    className={`px-3 py-2 rounded-[20px] border-2 font-ui text-[13px] font-semibold transition-colors ${
                      isExcluded ? 'border-[#CC0000] bg-[#CC0000] text-white' : 'border-[#3A3A3A] bg-[#1A1A1A] text-[#9A9A9A] hover:border-[#555] hover:text-white'
                    }`}
                  >
                    {w.id}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const { setMessage, clearMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const navigate = useNavigate();
  const storageCodes = useStorageCodes();
  const workstations = useWorkstations();

  // Session-level persistence (App-Wide screen-persistence item, v1.7.0) — see
  // ELAContext.tsx's own doc comment.
  const {
    storageCode, setStorageCode, size, setSize, selected, setSelected,
    aisleStart, setAisleStart, aisleEnd, setAisleEnd,
    workstation, setWorkstation,
    workstationFilterActive, setWorkstationFilterActive,
    excludedWorkstations, setExcludedWorkstations,
  } = useELA();
  const [rows, setRows] = useState<AisleRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortState>({ column: 'aisle', direction: 'asc' });

  /** Applies a new Storage Code filter, clearing the current row selection. */
  const handleStorageCodeChange = useCallback((v: string) => {
    setStorageCode(v);
    setSelected(null);
  }, [setStorageCode, setSelected]);

  // Aisle Range (GitHub #124) — each end independently existence-checked (issue #161;
  // previously "is this a number" was the only check, per this screen's own doc note that
  // "any non-negative range is syntactically valid even if it happens to match zero
  // aisles"). The range filter still applies whatever was typed regardless of validity
  // (via `onConfirm`, which fires before the async check settles) — an aisle range
  // legitimately matching zero results isn't an error the way a single specific-aisle
  // field's bad value is; `invalid` only drives a visual hint, not a block.
  const aisleStartFields = useAisleField({
    fetch: useCallback((aisle) => apiFetch<{ exists: boolean; breakdown: AisleBreakdownEntry[] }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!), [token]),
    onConfirm: useCallback((v) => { setAisleStart(v); setSelected(null); hidePanel(); }, [setAisleStart, setSelected, hidePanel]),
  });
  const aisleEndFields = useAisleField({
    fetch: useCallback((aisle) => apiFetch<{ exists: boolean; breakdown: AisleBreakdownEntry[] }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!), [token]),
    onConfirm: useCallback((v) => { setAisleEnd(v); setSelected(null); hidePanel(); }, [setAisleEnd, setSelected, hidePanel]),
  });
  useEffect(() => { aisleStartFields.field.set(aisleStart); }, [aisleStart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { aisleEndFields.field.set(aisleEnd); }, [aisleEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Workstation restrict-to filter (GitHub #124). The wash itself is automatic now
   *  (Feature 10 — `CodePickerField` computes and washes its own invalid state); this only
   *  drives the message-bar side effect, reactively rather than commit-only. */
  const handleWorkstationChange = useCallback((v: string) => {
    setWorkstation(v);
    setSelected(null);
  }, [setWorkstation, setSelected]);
  const handleWorkstationValidityChange = useCallback((inv: boolean) => {
    if (inv) setMessage({ type: 'error', text: 'Invalid Workstation' });
  }, [setMessage]);

  /** Workstation exclude filter (GitHub #125) — toggling the filter chip itself, or
   *  toggling one workstation's membership in the excluded set. */
  const toggleWorkstationFilterActive = useCallback(() => {
    setWorkstationFilterActive(!workstationFilterActive);
    setSelected(null);
  }, [workstationFilterActive, setWorkstationFilterActive, setSelected]);
  const toggleExcludedWorkstation = useCallback((id: string) => {
    setExcludedWorkstations(
      excludedWorkstations.includes(id)
        ? excludedWorkstations.filter((w) => w !== id)
        : [...excludedWorkstations, id],
    );
    setSelected(null);
  }, [excludedWorkstations, setExcludedWorkstations, setSelected]);

  const storageDesc = useMemo(
    () => storageCodes?.find((c) => c.code === storageCode)?.desc ?? null,
    [storageCodes, storageCode],
  );
  // Sourced from StorageCodeField/SizeField's own reactive validity (Feature 10) instead
  // of re-deriving the same full-list-membership check here — the fetch effect below still
  // needs to know, to gate the actual query/skip a doomed lookup, not just for the wash
  // (which is automatic now).
  const [isInvalidCode, setIsInvalidCode] = useState(false);
  const [isInvalidSize, setIsInvalidSize] = useState(false);

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
    clearMessage();
    let cancelled = false;
    setLoading(true);
    // Default sort matches what was actually searched for: the queried size's own count
    // when one was given (so its column shows as already sorted), otherwise Aisle number.
    setSort(size ? { column: size, direction: 'desc' } : { column: 'aisle', direction: 'asc' });
    // GitHub #191: Size is a sort/display control here, not a query-narrowing filter —
    // deliberately never sent to the API (unlike STG's own InfoPanel, which reuses this
    // same endpoint but still narrows by its Master Control Size). Only Aisle Range and
    // Workstation narrow which aisles come back; every qualifying aisle's full sizes
    // breakdown is always returned regardless of `size`.
    const params = new URLSearchParams({ storageCode });
    if (aisleStart) params.set('aisleStart', aisleStart);
    if (aisleEnd) params.set('aisleEnd', aisleEnd);
    if (workstation) params.set('workstation', workstation);
    if (workstationFilterActive && excludedWorkstations.length > 0) {
      params.set('excludeWorkstations', excludedWorkstations.join(','));
    }
    apiFetch<AisleRow[]>(`/api/locations/empty-by-aisle?${params.toString()}`, token!)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setMessage({ type: 'error', text: `Lookup failed — ${err instanceof Error ? err.message : 'please try again'}` });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [
    storageCode, size, isInvalidCode, isInvalidSize, token, setMessage, clearMessage,
    aisleStart, aisleEnd, workstation, workstationFilterActive, excludedWorkstations,
  ]);

  const selectedRow = rows?.find((r) => r.aisle === selected) ?? null;

  /** Selects a result row, or deselects it if it's already the selected row. */
  function toggleRow(aisle: number) {
    setSelected(selected === aisle ? null : aisle);
  }

  /** Sorts by the tapped column; tapping the already-active column flips its direction.
   *  Sorting by a size column also fills that size into the Size field above (direct
   *  instruction) — column is literally a size code whenever it isn't 'aisle' (see
   *  AisleSizeTable's own column definitions), so this is the same value the field itself
   *  would hold. Size is a display/sort control, not a query filter (GitHub #191 — it's
   *  deliberately excluded from the fetch effect's own params below), so writing it here
   *  doesn't narrow the grid; it's kept in sync because Stage Aisle reads Size straight off
   *  this same state to pre-populate STG (see stageAisle below), and because it drives the
   *  fetch effect's own default-sort-on-refetch logic. Clears the current row selection,
   *  same as changing Size directly via the field does. */
  function handleSort(column: string) {
    setSort((prev) => (prev.column === column
      ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: column === 'aisle' ? 'asc' : 'desc' }));
    if (column !== 'aisle') {
      setSize(column);
      setSelected(null);
    }
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
      <div className="flex items-end justify-between gap-4 shrink-0 flex-wrap">
        <div className="flex items-end gap-4 flex-wrap">
          <StorageCodeField value={storageCode} onChange={handleStorageCodeChange} closeOnAutoSubmit onValidityChange={setIsInvalidCode} />
          <SizeField value={size} onChange={(v) => { setSize(v); setSelected(null); }} onValidityChange={setIsInvalidSize} />
          {/* Aisle Range (GitHub #124) — restricts results to aisles within [start, end]. */}
          <div className="flex items-end gap-2">
            <NumpadFieldBox
              label="Start Aisle"
              value={aisleStartFields.field.value}
              onFocus={aisleStartFields.focusField}
              active={aisleStartFields.field.isActive}
              invalid={aisleStartFields.invalid}
              width="w-[110px]"
              boxClass="h-[64px] px-4 rounded-[12px]"
              valueClass="text-[26px] font-medium"
              caretClass="w-[2px] h-[24px]"
            />
            <span className="font-ui text-[16px] text-[#555] pb-4">–</span>
            <NumpadFieldBox
              label="End Aisle"
              value={aisleEndFields.field.value}
              onFocus={aisleEndFields.focusField}
              active={aisleEndFields.field.isActive}
              invalid={aisleEndFields.invalid}
              width="w-[110px]"
              boxClass="h-[64px] px-4 rounded-[12px]"
              valueClass="text-[26px] font-medium"
              caretClass="w-[2px] h-[24px]"
            />
          </div>
          {/* Workstation restrict-to (GitHub #124) — independent of the exclude-bubble
              Workstation filter below; both can be active at once. */}
          <WorkstationField
            value={workstation}
            onChange={handleWorkstationChange}
            size="compact"
            strict
            onValidityChange={handleWorkstationValidityChange}
          />
          {/* Filter-button system (GitHub #125) — currently just the one Workstation
              exclude filter; a generic multi-filter framework isn't built out further
              than that since nothing else was actually asked for yet. */}
          <WorkstationExcludeFilter
            active={workstationFilterActive}
            onToggleActive={toggleWorkstationFilterActive}
            excluded={excludedWorkstations}
            onToggleExcluded={toggleExcludedWorkstation}
            workstations={workstations}
          />
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
