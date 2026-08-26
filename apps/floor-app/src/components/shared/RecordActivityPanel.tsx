import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { LiveId } from '../ui/LiveId';
import {
  detailFor,
  isVisibleActivity,
  severityColorClass,
  severityFor,
  tagFor,
  type ActivityEntry,
  type DetailLine,
  type DetailToken,
} from '../../lib/activityFormat';

function fmtTimestamp(timestamp: string): string {
  const d = new Date(timestamp);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function DetailLineView({ line, colorClass }: { line: DetailLine; colorClass: string }) {
  return (
    <span className={`font-ui text-[14px] ${colorClass}`}>
      {line.map((token: DetailToken, i) =>
        typeof token === 'string'
          ? <span key={i}>{token}</span>
          : <LiveId key={i} id={token.id} type={token.type} className="text-[14px]" />,
      )}
    </span>
  );
}

interface RecordActivityPanelProps {
  endpoint: string;
  token: string;
  recordLabel: string;
}

/**
 * Fixed-height panel showing the last 30 days of ActivityLog entries for one
 * record (Pallet ID or Location ID). Always visible (not collapsible), fetches
 * on mount, scrolls internally when more than ~5 entries.
 */
export function RecordActivityPanel({ endpoint, token, recordLabel }: RecordActivityPanelProps) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState(false);

  const fetchActivity = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<ActivityEntry[]>(endpoint, token);
      setEntries(data.filter(isVisibleActivity));
    } catch {
      setError(true);
    }
  }, [endpoint, token]);

  useEffect(() => { void fetchActivity(); }, [fetchActivity]);

  return (
    <div className="mt-4 border border-[#2A2A2A] rounded-[10px] overflow-hidden flex flex-col">
      <div className="px-4 py-2 bg-[#111111] shrink-0">
        <span className="font-data text-[13px] font-semibold tracking-[1.5px] text-[#9A9A9A] uppercase">
          Activity — {recordLabel} — Last 30 Days
        </span>
      </div>

      <div className="h-[240px] overflow-y-auto overscroll-contain touch-pan-y px-4 py-3 bg-[#0A0A0A] flex flex-col gap-2">
        {error && (
          <p className="font-ui text-[14px] text-[#CC5555]">Couldn't load activity.</p>
        )}
        {!error && entries === null && (
          <p className="font-ui text-[14px] text-[#9A9A9A] animate-pulse">Loading…</p>
        )}
        {!error && entries !== null && entries.length === 0 && (
          <p className="font-ui text-[14px] text-[#555]">No activity in the last 30 days.</p>
        )}
        {!error && entries !== null && entries.map((entry) => {
          const colorClass = severityColorClass(severityFor(entry));
          return (
            <div key={entry.id} className="flex flex-col gap-0.5 pb-2 border-b border-[#1A1A1A] last:border-0">
              <div className="flex items-baseline gap-2">
                <span className="font-data text-[13px] font-bold text-[#FF4444]">{tagFor(entry)}</span>
                <span className="font-ui text-[12px] text-[#666]">{fmtTimestamp(entry.timestamp)}</span>
              </div>
              {detailFor(entry).map((line, i) => (
                <DetailLineView key={i} line={line} colorClass={colorClass} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
