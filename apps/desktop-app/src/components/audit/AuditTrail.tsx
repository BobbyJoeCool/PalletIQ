import type { AuditRef, AuditResult } from '@shared/audit';
import { detailPairs, formatAuditTime, refsOfEntry } from '../../lib/auditFormat';
import { AuditChip } from './AuditChip';

interface AuditTrailProps {
  result: AuditResult;
  onSend: (paneIndex: number, target: AuditRef) => void;
}

/**
 * A record's history (#148), newest first. Each entry shows when, what, every record it
 * touches as a cross-reference chip, its reason code, and its remaining details.
 */
export function AuditTrail({ result, onSend }: AuditTrailProps) {
  if (result.trail.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No history recorded.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {result.truncated && (
        <p className="rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-1 text-xs text-[var(--warning)]">
          Showing the most recent {result.trail.length} entries. Older history is not shown.
        </p>
      )}

      <ol className="m-0 flex list-none flex-col p-0">
        {result.trail.map((entry) => {
          const details = detailPairs(entry);
          return (
            <li
              key={entry.key}
              className="flex flex-col gap-1 border-t border-[var(--border-subtle)] py-2 first:border-t-0 print:break-inside-avoid"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <time
                  dateTime={entry.timestamp}
                  className="font-data text-xs text-[var(--text-muted)]"
                >
                  {formatAuditTime(entry.timestamp)}
                </time>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {entry.action}
                </span>
                {entry.reason && (
                  <span className="rounded border border-[var(--border-strong)] px-1 font-data text-[11px] text-[var(--text-tertiary)]">
                    {entry.reason}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {refsOfEntry(entry).map((target) => (
                  <AuditChip key={`${target.type}:${target.id}`} target={target} onSend={onSend} />
                ))}
              </div>

              {details.length > 0 && (
                <p className="m-0 break-words text-xs text-[var(--text-muted)]">
                  {details.map((pair) => `${pair.key}: ${pair.value}`).join(' · ')}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
