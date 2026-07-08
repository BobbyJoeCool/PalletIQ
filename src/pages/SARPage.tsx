import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface AisleStagedRow {
  aisle: number;
  stagedCount: number;
  oldestStagedAge: number;
  freightTypes: string[];
}

/** Formats a duration in seconds as "Xd Xh" / "Xh Xm" / "Xm", per SAR.md. */
function fmtAge(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** One ranked list panel (Most Staged / Staged Longest), sharing row layout but not sort order or displayed value. */
function Column({
  title, list, loading, valueFor, selected, onSelect,
}: {
  title: string;
  list: AisleStagedRow[];
  loading: boolean;
  valueFor: (r: AisleStagedRow) => string;
  selected: number | null;
  onSelect: (aisle: number) => void;
}) {
  return (
    <div className="flex-1 flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#2A2A2A] bg-[#111111] shrink-0">
        <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-5 py-4 font-ui text-[15px] text-[#9A9A9A] animate-pulse">Loading…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No staged locations in system</p>
        ) : (
          list.map((r) => (
            <button
              type="button"
              key={r.aisle}
              onClick={() => onSelect(r.aisle)}
              className={`w-full flex items-center justify-between gap-3 px-5 py-3 border-b border-[#1A1A1A] text-left transition-colors ${selected === r.aisle ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'}`}
            >
              <span className="font-data text-[20px] font-semibold text-white shrink-0">A-{r.aisle}</span>
              <span className="flex-1 flex flex-wrap gap-1 justify-end">
                {r.freightTypes.map((ft) => (
                  <span key={ft} className="font-data text-[12px] font-medium text-[#9A9A9A] bg-[#1A1A1A] border border-[#2A2A2A] rounded-[4px] px-1.5 py-0.5">
                    {ft}
                  </span>
                ))}
              </span>
              <span className="font-data text-[18px] text-[#CFCFCF] shrink-0">{valueFor(r)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * SAR — Staged Aisle Report. Read-only data, no filters; loads once on open (the worker
 * reopens the screen to refresh). Two independent lists: aisles with the most staged
 * locations, and aisles with the longest-waiting staged location. Each row also shows
 * the freight types (StorageCode-Size) staged in that aisle. Selecting a row (from either
 * list) enables navigation to that aisle's System Directed Put or Stage Aisle screen. See
 * DevNotes/Screen-Specs/SAR.md.
 */
export function SARPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AisleStagedRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AisleStagedRow[]>('/api/reporting/staged-aisle', token!)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mostStaged = rows ? [...rows].sort((a, b) => b.stagedCount - a.stagedCount || a.aisle - b.aisle) : [];
  const stagedLongest = rows ? [...rows].sort((a, b) => b.oldestStagedAge - a.oldestStagedAge || a.aisle - b.aisle) : [];

  /** Toggles row selection — tapping the already-selected aisle deselects it. */
  function toggleSelect(aisle: number) {
    setSelected((s) => (s === aisle ? null : aisle));
  }

  /** Navigates to SDP, pre-populated with the selected aisle. */
  function goToDirectedPut() {
    if (selected == null) return;
    navigate('/put/directed', { state: { aisle: selected } });
  }

  /** Navigates to STG, pre-populated with the selected aisle. */
  function goToStageAisle() {
    if (selected == null) return;
    navigate('/stage', { state: { aisle: selected } });
  }

  return (
    <div className="absolute inset-0 flex flex-col gap-4 p-6 select-none">
      <div className="flex items-center justify-end gap-3 shrink-0">
        <button
          type="button"
          onClick={goToDirectedPut}
          disabled={selected == null}
          className="h-[44px] px-5 rounded-[10px] font-ui text-[15px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 disabled:hover:bg-[#003366] transition-colors"
        >
          Directed Put {selected != null && `— A-${selected}`}
        </button>
        <button
          type="button"
          onClick={goToStageAisle}
          disabled={selected == null}
          className="h-[44px] px-5 rounded-[10px] font-ui text-[15px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 disabled:hover:bg-[#003366] transition-colors"
        >
          Stage Aisle {selected != null && `— A-${selected}`}
        </button>
      </div>
      <div className="flex-1 flex gap-4 min-h-0">
        <Column title="Most Staged" list={mostStaged} loading={loading} valueFor={(r) => `${r.stagedCount} staged`} selected={selected} onSelect={toggleSelect} />
        <Column title="Staged Longest" list={stagedLongest} loading={loading} valueFor={(r) => fmtAge(r.oldestStagedAge)} selected={selected} onSelect={toggleSelect} />
      </div>
    </div>
  );
}
