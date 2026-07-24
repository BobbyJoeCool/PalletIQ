import type { Key, ReactNode } from 'react';

export interface SessionHistoryPanelProps<T> {
  /** Header text, e.g. "Put History". */
  title: string;
  /** Shown in place of the list when `entries` is empty, e.g. "No puts this session". */
  emptyMessage: string;
  entries: T[];
  /** React key for a row — most screens have a real domain key (`entry.key`,
   *  `entry.reservationId`); PIP falls back to its array index. */
  keyFn: (entry: T, index: number) => Key;
  /** Row content — the shared per-row wrapper (padding/divider/flex-col) is provided by
   *  this component; return just the row's own content. */
  renderRow: (entry: T) => ReactNode;
  /** Panel width class — screens vary (PIP/SDP/MNP's 456px vs. PAR's narrower 420px). */
  width: string;
}

/**
 * Right-column session-local history panel (fixed width, header bar, empty-state
 * message, scrollable timestamped rows) — shared chrome behind PIP's Pull History,
 * MNP's Put History, SDP's Put History, and PAR's Reinstate Log (Refactoring Audit
 * finding F5). Row *content* is fully caller-supplied via `renderRow`, since each
 * screen's row shape genuinely differs (MNP's occupied/staged badges and outcome
 * color, PIP's pulled/remaining quantity lines, SDP's directed-vs-final location, PAR's
 * DPCI/cartons/location-or-PUT_PENDING line) — only the panel shell and per-row wrapper
 * are actually duplicated.
 */
export function SessionHistoryPanel<T>({ title, emptyMessage, entries, keyFn, renderRow, width }: SessionHistoryPanelProps<T>) {
  return (
    <div className={`${width} flex flex-col border-l border-[#1C1C1C] overflow-hidden`}>
      <div className="px-5 py-3 border-b border-[#1C1C1C] shrink-0">
        <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-5 py-4 font-ui text-[15px] text-[#555]">{emptyMessage}</p>
        ) : (
          entries.map((entry, i) => (
            <div key={keyFn(entry, i)} className="px-5 py-3 border-b border-[#111] flex flex-col gap-1">
              {renderRow(entry)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
