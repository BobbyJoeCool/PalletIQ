import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AisleGrid, type GridLevel } from '../components/shared/AisleGrid';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { useNumpadField } from '../lib/useNumpadField';

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

/** Renders the blank / `E` / `E(S)` / `(S)` cell format shared with ELA's results table. */
function CellValue({ empty, staged }: { empty: number; staged: number }) {
  if (empty === 0 && staged === 0) return null;
  return (
    <span className="font-data text-[15px] font-medium text-white">
      {empty > 0 && empty}
      {staged > 0 && <span className="text-[12px] text-[#9A9A9A] ml-0.5">({staged})</span>}
    </span>
  );
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

  const aisleField = useNumpadField('numpad');
  const storageField = useNumpadField('keyboard');
  const [aisle, setAisle] = useState<number | null>(prefill?.aisle ?? null);
  const [storageCode, setStorageCode] = useState(prefill?.storageCode ?? '');
  const [result, setResult] = useState<EmptyByZoneResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Pre-populate field displays from router state (ELA "View Zone Map" / STG) on mount.
  useEffect(() => {
    if (prefill?.aisle != null) aisleField.set(String(prefill.aisle));
    if (prefill?.storageCode) storageField.set(prefill.storageCode);
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

  /** Registers the Storage Code field's keyboard handler; on confirm, uppercases the value and dismisses the panel. */
  const focusStorageField = useCallback(() => {
    storageField.focus((v) => {
      const trimmed = v.trim().toUpperCase();
      storageField.set(trimmed);
      setStorageCode(trimmed);
      hidePanel();
    });
  }, [storageField, hidePanel]);

  // Query trigger: grid loads once both fields have values; re-runs on either change.
  // (aisle/storageCode only ever move from empty to a submitted value — see focusAisleField
  // and focusStorageField — so there's no complete-to-incomplete transition to reset here.)
  useEffect(() => {
    if (aisle == null || !storageCode) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data-fetch-on-filter-change effect
    setLoading(true);
    setNotFound(false);
    apiFetch<EmptyByZoneResult>(
      `/api/locations/empty-by-zone?aisle=${aisle}&storageCode=${encodeURIComponent(storageCode)}`,
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

  /** Navigates to STG, pre-populated with the currently queried aisle. */
  function stageAisle() {
    if (aisle == null) return;
    navigate('/stage', { state: { aisle } });
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
            className="flex items-center h-[64px] px-5 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors"
          >
            <span className="font-data text-[26px] font-medium text-white">
              {aisleField.value || <span className="text-[#444]">—</span>}
            </span>
          </button>
        </div>
        <div className="w-[220px] flex flex-col gap-1">
          <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">
            Storage Code
          </span>
          <button
            type="button"
            onClick={focusStorageField}
            className="flex items-center h-[64px] px-5 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A] hover:border-[#555] transition-colors"
          >
            <span className="font-data text-[26px] font-medium text-white tracking-[0.04em]">
              {storageField.value || <span className="text-[#444]">—</span>}
            </span>
          </button>
        </div>
      </div>

      {/* Main area: grid + zone summary */}
      <div className="flex-1 flex gap-5 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {aisle == null || !storageCode ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="font-ui text-[18px] text-[#555]">
                Enter an Aisle and Storage Code to view the zone map
              </p>
            </div>
          ) : loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="font-ui text-[18px] text-[#9A9A9A] animate-pulse">Loading…</p>
            </div>
          ) : notFound || !result ? (
            <div className="w-full h-full flex items-center justify-center">
              <p className="font-ui text-[18px] text-[#555]">
                No locations found for Aisle {aisle} — {storageCode}
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
