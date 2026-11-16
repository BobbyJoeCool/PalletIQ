import type { AuditRef, AuditResult } from '@shared/audit';
import { summaryValueText } from '../../lib/auditFormat';
import { AuditChip } from './AuditChip';

interface AuditSummaryProps {
  result: AuditResult;
  onSend: (paneIndex: number, target: AuditRef) => void;
}

/**
 * The current-state block at the top of a pane (#148): the record's title and its
 * summary lines. A line that points at another record shows its value as a chip.
 */
export function AuditSummary({ result, onSend }: AuditSummaryProps) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">{result.title}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {result.fields.map((field, index) => (
          // Labels repeat (one "Pallet" line per pallet in a location), so index is the key.
          <div key={index} className="contents">
            <dt className="text-[var(--text-muted)]">{field.label}</dt>
            <dd className="m-0 min-w-0 break-words text-[var(--text-secondary)]">
              {field.ref ? (
                <AuditChip target={field.ref} label={summaryValueText(field)} onSend={onSend} />
              ) : (
                summaryValueText(field)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
