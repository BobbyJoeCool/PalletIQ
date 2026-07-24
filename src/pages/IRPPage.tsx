import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { FUNCTION_META, fmtClock, type FunctionFieldValues } from '../lib/irpFormat';
import { FunctionFields } from '../components/shared/IRPFields';

interface FunctionSummary extends FunctionFieldValues {
  greyed: boolean;
  hasActivity: boolean;
  hasAssignment: boolean;
}

interface SummaryResponse {
  shiftStart: string | null;
  shiftEnd: string;
  functions: FunctionSummary[];
}

/** One IRP summary row — tapping a non-greyed row zooms into its hourly breakdown. */
function FunctionRow({ summary, onOpen }: { summary: FunctionSummary; onOpen: () => void }) {
  const meta = FUNCTION_META[summary.functionCode];
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={summary.greyed}
      className={`w-full flex items-center gap-6 px-5 py-3 border-b border-[#1A1A1A] text-left transition-colors ${summary.greyed ? 'opacity-40 cursor-default' : 'hover:bg-[#111111]'}`}
    >
      <span className="font-ui text-[16px] font-semibold text-white w-[170px] shrink-0">{meta.name}</span>
      <FunctionFields summary={summary} />
    </button>
  );
}

/**
 * IRP — Individual Reporting. Live, today-only personal productivity dashboard: 9 prod-
 * function rows, greyed until the worker has an assignment or activity in that function
 * today. No numpad, no filters — loads once on open, same as SAR. Tapping a row (once it
 * has any data) zooms into that function's hour-by-hour breakdown. See
 * DevNotes/DesignPrompts/IRP.md and Documentation/ScreenSpecs/IRP.md.
 */
export function IRPPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SummaryResponse>('/api/reporting/individual', token!)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ shiftStart: null, shiftEnd: new Date().toISOString(), functions: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col gap-3 p-6 select-none">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="font-ui text-[20px] font-semibold text-white">Individual Reporting</h1>
        {data?.shiftStart && (
          <span className="font-data text-[15px] text-[#9A9A9A]">
            {fmtClock(data.shiftStart)}–{fmtClock(data.shiftEnd)}
          </span>
        )}
      </div>

      <div className="flex-1 border border-[#2A2A2A] rounded-[12px] overflow-hidden overflow-y-auto">
        {loading ? (
          <p className="px-5 py-4 font-ui text-[15px] text-[#9A9A9A] animate-pulse">Loading…</p>
        ) : !data || data.functions.length === 0 ? (
          <p className="px-5 py-4 font-ui text-[15px] text-[#555]">Unable to load today's data</p>
        ) : (
          data.functions.map((f) => (
            <FunctionRow
              key={f.functionCode}
              summary={f}
              onOpen={() => navigate(`/reporting/individual/${f.functionCode}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
