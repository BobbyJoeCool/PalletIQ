import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AisleGrid, type GridLevel } from '../components/shared/AisleGrid';
import { CellValue } from '../components/shared/CellValue';
import { StorageCodeField } from '../components/shared/StorageCodeField';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { useAisleFreightTypes } from '../lib/useAisleFreightTypes';
import { useNumpadField } from '../lib/useNumpadField';
import { useStorageCodes } from '../lib/useStorageCodes';

interface Breakdown {
  storageCode: string;
  size: string;
  empty: number;
  staged: number;
}

interface ZoneSummaryEntry {
  zone: number;
  breakdown: Breakdown[];
}

interface EmptyByZoneResult {
  aisle: number;
  levels: GridLevel[];
  zoneSummary: ZoneSummaryEntry[];
}

interface NavState {
  aisle?: number;
  storageCode?: string;
}

/**
 * ELZ — Empty Locations by Zone.
 * Visual map of one aisle's physical layout via the shared AisleGrid component (Phase 7.0):
 * 8 columns (Zone 1-4 × Odd/Even), one row per level, Level 1 at the bottom. Cells show
 * only StorageCode-Size and a Contraction highlight — no occupied/empty/staged coloring
 * (see AisleGrid.tsx). A per-zone summary panel gives the actionable empty/staged counts
 * by StorageCode-Size, scoped to the queried Storage Code. Can be entered directly via
 * jump code or pre-populated from ELA / STG via router state.
 * See DevNotes/Screen-Specs/ELZ.md.
 */
export function ELZPage() {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const prefill = (routerLocation.state as NavState | null) ?? null;

  // padOnSubmit: typing "5" and hitting OK is accepted as "005" (see LocationEntryFields).
  const aisleField = useNumpadField('numpad', 3, true);
  const [aisle, setAisle] = useState<number | null>(prefill?.aisle ?? null);
  const [storageCode, setStorageCode] = useState(prefill?.storageCode ?? '');
  const [result, setResult] = useState<EmptyByZoneResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Narrows the Storage Code dropdown-helper (issue #80) to codes actually present in
  // this aisle, once one is entered — the zone map/summary below stays fully unfiltered
  // regardless (that's the existing, separate ELZ.md behavior; narrowing only ever
  // applies to this entry field's own popup, never to the map/summary display).
  const aisleTypes = useAisleFreightTypes(aisle);
  const fullStorageCodes = useStorageCodes();
  const storageCodeOptions = aisleTypes && fullStorageCodes
    ? fullStorageCodes.filter((c) => aisleTypes.storageCodes.includes(c.code))
    : undefined;

  // Pre-populate the Aisle field display from router state (ELA "View Zone Map" / STG) on
  // mount — Storage Code's pre-population is handled by StorageCodeField's own value-sync effect.
  useEffect(() => {
    if (prefill?.aisle != null) aisleField.set(String(prefill.aisle));
    // Field setters are stable across the lifetime of the hook — only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Registers the Aisle field's numpad handler; on confirm, parses the value and dismisses the panel. */
  const focusAisleField = useCallback(() => {
    aisleField.focus((v) => {
      const trimmed = v.trim();
      const n = parseInt(trimmed, 10);
      aisleField.set(trimmed);
      setAisle(isNaN(n) ? null : n);
      hidePanel();
    });
  }, [aisleField, hidePanel]);

  // Query trigger: grid loads from Aisle alone (issue #60 — Storage Code is no longer
  // required); re-runs on either field's change. When Storage Code is present the zone
  // summary narrows to it, same as before — the grid itself is never filtered by it.
  // (aisle/storageCode only ever move from empty to a submitted value — see focusAisleField
  // and focusStorageField — so there's no complete-to-incomplete transition to reset here.)
  useEffect(() => {
    if (aisle == null) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data-fetch-on-filter-change effect
    setLoading(true);
    setNotFound(false);
    const params = new URLSearchParams({ aisle: String(aisle) });
    if (storageCode) params.set('storageCode', storageCode);
    apiFetch<EmptyByZoneResult>(
      `/api/locations/empty-by-zone?${params.toString()}`,
      token!,
    )
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && err.message === 'NOT_FOUND') {
          setResult(null);
          setNotFound(true);
        } else {
          setResult(null);
          setMessage({ type: 'error', text: `Lookup failed — ${err instanceof Error ? err.message : 'please try again'}` });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [aisle, storageCode, token, setMessage]);

  /** Navigates to STG, pre-populated with the currently queried aisle and Storage Code. */
  function stageAisle() {
    if (aisle == null) return;
    navigate('/stage', { state: { aisle, storageCode } });
  }

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      {/* Top bar */}
      <div className="flex items-end gap-4 shrink-0">
        <div className="w-[160px] flex flex-col gap-1">
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
            Aisle
          </span>
          <button
            type="button"
            onClick={focusAisleField}
            className={`flex items-center h-[64px] px-5 rounded-[12px] bg-[#0D0D0D] border-2 transition-colors ${aisleField.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
          >
            <span className="font-data text-[26px] font-medium text-white">
              {aisleField.value || <span className="text-[#444]">—</span>}
            </span>
            {aisleField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
          </button>
        </div>
        <StorageCodeField value={storageCode} onChange={setStorageCode} options={storageCodeOptions} />
      </div>

      {/* Main area: grid + zone summary */}
      <div className="flex-1 flex gap-5 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {aisle == null ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="font-ui text-[18px] text-[#555]">
                Enter an Aisle to view the zone map
              </p>
            </div>
          ) : loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="font-ui text-[18px] text-[#9A9A9A] animate-pulse">Loading…</p>
            </div>
          ) : notFound || !result ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="font-ui text-[18px] text-[#555]">
                No locations found for Aisle {aisle}{storageCode ? ` — ${storageCode}` : ''}
              </p>
            </div>
          ) : (
            <AisleGrid levels={result.levels} />
          )}
        </div>

        {/* Per-zone summary panel */}
        <div className="w-[360px] shrink-0 flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2A2A2A] bg-[#111111] shrink-0">
            <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
              Zone Summary
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!result || result.zoneSummary.length === 0 ? (
              <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No data</p>
            ) : (
              result.zoneSummary.map((z) => (
                <div key={z.zone} className="px-5 py-3 border-b border-[#1A1A1A]">
                  <span className="font-ui text-[15px] font-semibold text-white">Zone {z.zone}</span>
                  <div className="flex flex-col gap-1 mt-2">
                    {z.breakdown.map((b) => (
                      <div key={`${b.storageCode}-${b.size}`} className="flex items-center justify-between">
                        <span className="font-data text-[14px] text-[#CFCFCF]">
                          {b.storageCode}-{b.size}
                        </span>
                        <CellValue empty={b.empty} staged={b.staged} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={stageAisle}
            disabled={aisle == null}
            className="h-[64px] font-ui text-[18px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors shrink-0"
          >
            Stage Aisle
          </button>
        </div>
      </div>
    </div>
  );
}
