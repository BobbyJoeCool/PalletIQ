import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { FUNCTION_META, type FunctionFieldValues } from '../lib/irpFormat';
import { FunctionFields } from '../components/shared/IRPFields';

interface HourlyRow {
  hourLabel: string;
  hourStart: string;
  summary: FunctionFieldValues;
}

interface HourlyResponse {
  functionCode: string;
  rows: HourlyRow[];
}

/**
 * IRP zoom-in — hour-by-hour breakdown for one prod function, today, logged-in worker
 * only. Only hours the worker was actually assigned to this function are listed (no
 * blank/zero rows for unassigned hours). See DevNotes/DesignPrompts/IRP.md's Zoom-In
 * (Hour-by-Hour) View section.
 */
export function IRPHourlyPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { functionCode = '' } = useParams<{ functionCode: string }>();
  const [data, setData] = useState<HourlyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<HourlyResponse>(`/api/reporting/individual/${functionCode}/hourly`, token!)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ functionCode, rows: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionCode]);

  const meta = FUNCTION_META[functionCode.toUpperCase()];

  return (
    <div className="absolute inset-0 flex flex-col gap-3 p-6 select-none">
      <div className="flex items-center gap-4 shrink-0">
        <button
          type="button"
          onClick={() => navigate('/reporting/individual')}
          className="h-[40px] px-4 rounded-[10px] font-ui text-[14px] font-semibold bg-[#1A1A1A] hover:bg-[#252525] text-[#CFCFCF] border border-[#2A2A2A] transition-colors"
        >
          ← Back
        </button>
        <h1 className="font-ui text-[20px] font-semibold text-white">{meta?.name ?? functionCode}</h1>
      </div>

      <div className="flex-1 border border-[#2A2A2A] rounded-[12px] overflow-hidden overflow-y-auto">
        {loading ? (
          <p className="px-5 py-4 font-ui text-[15px] text-[#9A9A9A] animate-pulse">Loading…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No assigned hours today</p>
        ) : (
          data.rows.map((r) => (
            <div key={r.hourStart} className="w-full flex items-center gap-6 px-5 py-3 border-b border-[#1A1A1A]">
              <span className="font-ui text-[16px] font-semibold text-white w-[170px] shrink-0">{r.hourLabel}</span>
              <FunctionFields summary={{ ...r.summary, functionCode: data.functionCode }} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
