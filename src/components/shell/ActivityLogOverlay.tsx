import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { detailFor, isVisibleActivity, tagFor, type ActivityEntry } from '../../lib/activityFormat';

const WINDOW_HOURS = 12;

/** Formats an entry's timestamp as e.g. "10:42 AM", matching the design's example rows. */
function fmtTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface ActivityLogOverlayProps {
  onClose: () => void;
}

/**
 * App-wide, cross-function rolling 12-hour activity log (issue #46). Opened from the
 * Header's "Activity" button on every authenticated screen — unlike each screen's own
 * existing session-local log/history panel (STG's collapsed bar, PIP/SDP/MNP's session
 * history lists), which are untouched and keep showing only that screen's own session
 * activity, this overlay always shows the logged-in worker's complete activity across
 * every function, backed by the real ActivityLog table rather than in-memory session
 * state — surviving reloads and reflecting a fresh 12-hour window every time it's opened.
 * See DevNotes/DesignPrompts/Feature-5-App-Wide-Activity-Log.md.
 */
export function ActivityLogOverlay({ onClose }: ActivityLogOverlayProps) {
  const { token, user } = useAuth();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect
    setEntries(null);
    setError(false);
    (async () => {
      try {
        const params = new URLSearchParams({ user: user!.zNumber, hoursBack: String(WINDOW_HOURS) });
        const data = await apiFetch<ActivityEntry[]>(`/api/activity?${params}`, token!);
        if (!cancelled) setEntries(data.filter(isVisibleActivity));
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex flex-col w-full max-w-[720px] max-h-[85%] rounded-[18px] overflow-hidden bg-[#0A0A0A] border border-[#2A2A2A]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222222]">
          <span className="font-data text-[14px] font-semibold tracking-[2px] text-[#9A9A9A] uppercase">
            Activity — Last {WINDOW_HOURS} Hours
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-ui text-[15px] text-[#9A9A9A] hover:text-white transition-colors"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
          {error && (
            <p className="font-ui text-[16px] text-[#CC5555]">Couldn't load activity — please try again.</p>
          )}
          {!error && entries === null && (
            <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>
          )}
          {!error && entries !== null && entries.length === 0 && (
            <p className="font-ui text-[16px] text-[#555]">No activity in the last {WINDOW_HOURS} hours.</p>
          )}
          {!error && entries !== null && entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-0.5 pb-3 border-b border-[#1A1A1A] last:border-0">
              <div className="flex items-baseline gap-2">
                <span className="font-data text-[15px] font-bold text-[#FF4444]">{tagFor(entry)}</span>
                <span className="font-ui text-[13px] text-[#666]">· {fmtTime(entry.timestamp)}</span>
              </div>
              <span className="font-ui text-[15px] text-[#CFCFCF]">{detailFor(entry)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
