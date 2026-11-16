import { DOWNTIME_CODE, OTHER_REASON, TIME_OFF_CODE, reasonListFor } from '@shared/workforce';
import type { Work } from '../../lib/rosterWork';
import { functionLabel } from '../../lib/rosterFormat';

interface WorkPickerProps {
  /** Accessible name prefix, e.g. "Before" / "After". */
  label: string;
  /** The department's job function codes. */
  functionCodes: readonly string[];
  value: Work;
  onChange: (work: Work) => void;
}

const selectClass =
  'h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]';

/**
 * Chooses what a stretch of time is (#145): a job function, Downtime (with a downtime
 * reason) or Time Off (with an attendance code). Other reveals a required note.
 */
export function WorkPicker({ label, functionCodes, value, onChange }: WorkPickerProps) {
  const reasons = reasonListFor(value.functionCode);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`${label} function`}
        value={value.functionCode}
        onChange={(e) =>
          onChange({ functionCode: e.target.value, reasonCode: null, reasonText: null })
        }
        className={selectClass}
      >
        <option value="" disabled>
          Choose…
        </option>
        {functionCodes.map((code) => (
          <option key={code} value={code}>
            {code} — {functionLabel(code)}
          </option>
        ))}
        <option value={DOWNTIME_CODE}>Downtime</option>
        <option value={TIME_OFF_CODE}>Time Off</option>
      </select>
      {reasons && (
        <select
          aria-label={`${label} reason`}
          value={value.reasonCode ?? ''}
          onChange={(e) =>
            onChange({ ...value, reasonCode: e.target.value || null, reasonText: null })
          }
          className={selectClass}
        >
          <option value="">Reason…</option>
          {reasons.map((r) => (
            <option key={r.code} value={r.code}>
              {value.functionCode === TIME_OFF_CODE ? `${r.code} — ` : ''}
              {r.label}
            </option>
          ))}
        </select>
      )}
      {value.reasonCode === OTHER_REASON && (
        <input
          aria-label={`${label} note`}
          value={value.reasonText ?? ''}
          onChange={(e) => onChange({ ...value, reasonText: e.target.value })}
          maxLength={255}
          placeholder="Note (required)"
          className={`${selectClass} w-48`}
        />
      )}
    </div>
  );
}
