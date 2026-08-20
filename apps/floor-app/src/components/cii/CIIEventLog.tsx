import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

interface EventEntry {
  source: string;
  eventType: string;
  timestamp: string;
  userZ: string | null;
  details?: Record<string, unknown>;
}

interface EventLogResponse {
  type: string;
  cid: string;
  events: EventEntry[];
}

interface Props {
  cid: string;
  token: string;
  onNavigateContainer: (cid: string) => void;
}

export function CIIEventLog({ cid, token, onNavigateContainer }: Props) {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<EventLogResponse>(`/api/containers/${cid}/events`, token)
      .then((data) => { if (!cancelled) { setEvents(data.events); setLoading(false); } })
      .catch(() => { if (!cancelled) { setEvents([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [cid, token]);

  return (
    <div>
      <h3 className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider mb-3">
        Event Log
      </h3>
      {loading && <p className="font-ui text-[14px] text-[#666]">Loading...</p>}
      {!loading && events.length === 0 && <p className="font-ui text-[14px] text-[#666]">No events recorded</p>}
      <div className="flex flex-col gap-2">
        {events.map((e, i) => (
          <div key={i} className="py-2 border-b border-[#1A1A1A]">
            <div className="flex items-center gap-2">
              <span className="font-ui text-[13px] font-semibold text-white uppercase">{e.eventType.replace(/_/g, ' ')}</span>
              {e.details?.userName != null && <span className="font-ui text-[12px] text-[#9A9A9A]">by {String(e.details.userName)}</span>}
            </div>
            <div className="font-ui text-[12px] text-[#666] mt-0.5">
              {new Date(e.timestamp).toLocaleString()}
            </div>
            {e.details?.reasonPrefix != null && e.details?.reasonNumber != null && (
              <div className="font-ui text-[12px] text-[#9A9A9A] mt-0.5">
                Reason: {String(e.details.reasonPrefix)}{String(e.details.reasonNumber)}
                {e.details.reasonNote ? ` — ${String(e.details.reasonNote)}` : ''}
              </div>
            )}
            {e.details?.childCid != null && (
              <button type="button" onClick={() => onNavigateContainer(String(e.details!.childCid))} className="font-ui text-[12px] text-[#4499FF] underline mt-0.5">
                {String(e.details.childCid)}
              </button>
            )}
            {e.details?.previousStore != null && e.details?.newStore != null && (
              <div className="font-ui text-[12px] text-[#9A9A9A] mt-0.5">
                Store: {String(e.details.previousStore)} → {String(e.details.newStore)}
              </div>
            )}
            {e.details?.previousQty != null && e.details?.newQty != null && (
              <div className="font-ui text-[12px] text-[#9A9A9A] mt-0.5">
                Qty: {String(e.details.previousQty)} → {String(e.details.newQty)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
