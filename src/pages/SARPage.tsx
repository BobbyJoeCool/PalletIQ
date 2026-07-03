import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface AisleStagedRow {
  aisle: number;
  stagedCount: number;
  oldestStagedAge: number;
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

function Column({
  title, list, loading, valueFor,
}: { title: string; list: AisleStagedRow[]; loading: boolean; valueFor: (r: AisleStagedRow) => string }) {
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
            <div key={r.aisle} className="flex items-center justify-between px-5 py-3 border-b border-[#1A1A1A]">
              <span className="font-data text-[20px] font-semibold text-white">A-{r.aisle}</span>
              <span className="font-data text-[18px] text-[#CFCFCF]">{valueFor(r)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * SAR — Staged Aisle Report. Read-only, no filters; loads once on open (the worker
 * reopens the screen to refresh). Two independent lists: aisles with the most staged
 * locations, and aisles with the longest-waiting staged location. See
 * DevNotes/Screen-Specs/SAR.md.
 */
export function SARPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AisleStagedRow[] | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="absolute inset-0 flex gap-4 p-6 select-none">
      <Column title="Most Staged" list={mostStaged} loading={loading} valueFor={(r) => `${r.stagedCount} staged`} />
      <Column title="Staged Longest" list={stagedLongest} loading={loading} valueFor={(r) => fmtAge(r.oldestStagedAge)} />
    </div>
  );
}
