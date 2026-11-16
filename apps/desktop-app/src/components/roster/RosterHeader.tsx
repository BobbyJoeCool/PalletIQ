import type { RosterView, ShiftCode } from '@shared/workforce';
import { DOWNTIME_CODE, TIME_OFF_CODE, projectedVolume, staffedAt } from '@shared/workforce';
import { clockText, colorFor, functionLabel } from '../../lib/rosterFormat';
import { ROSTER_ROW_COLUMNS } from './WorkerRow';

interface RosterHeaderProps {
  view: RosterView;
  date: string;
  onDateChange: (date: string) => void;
  onShiftChange: (shift: ShiftCode) => void;
  /** The instant staffing is shown for (pointer over a bar, else now or shift start). */
  staffingAt: number;
  selectedCount: number;
  focusCode: string | null;
  onFunctionClick: (code: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

/**
 * The roster's sticky header (#145): date and shift, the job functions (with staffing
 * against plan), Downtime and Time Off, and the time axis. A function button assigns the
 * selected workers; with nobody selected it calls up everyone who worked that function.
 */
export function RosterHeader(props: RosterHeaderProps) {
  const { view, staffingAt: at, selectedCount, focusCode } = props;
  const timelines = view.workers.map((w) => w.segments);
  const staffed = staffedAt(timelines, at);
  const rampFor = (z: string, code: string) =>
    view.workers.find((w) => w.zNumber === z)?.ramping.find((r) => r.functionCode === code)
      ?.percent ?? 100;

  const length = view.window.end - view.window.start;
  const hours: number[] = [];
  for (let t = view.window.start; t <= view.window.end; t += 3_600_000) hours.push(t);

  const shiftButton = (code: ShiftCode, label: string) => (
    <button
      type="button"
      onClick={() => props.onShiftChange(code)}
      aria-pressed={view.shiftCode === code}
      className={[
        'h-9 px-3 text-sm font-medium',
        view.shiftCode === code
          ? 'bg-[var(--red-primary)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-5)]',
      ].join(' ')}
    >
      {label} ({code})
    </button>
  );

  return (
    <div className="sticky top-0 z-20 -mx-8 -mt-8 flex flex-col gap-3 border-b border-[var(--border-default)] bg-[var(--surface-0)] px-8 pb-2 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Job/Function Assignment</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {view.departmentId} · {view.workers.length} on the roster ·{' '}
            {view.productiveHours.toFixed(2)} productive hours
          </p>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Date
            <input
              type="date"
              value={props.date}
              onChange={(e) => e.target.value && props.onDateChange(e.target.value)}
              className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)]"
            />
          </label>
          <div
            className="flex overflow-hidden rounded-md border border-[var(--border-strong)]"
            role="group"
            aria-label="Shift"
          >
            {shiftButton(view.shiftsOnDate.day, 'Day')}
            {shiftButton(view.shiftsOnDate.night, 'Night')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>
          {selectedCount > 0
            ? `${selectedCount} selected — click a function to assign their unassigned time`
            : 'Select names (Shift-click for a range), then click a function. With nobody selected, a function calls up who worked it.'}
        </span>
        <button
          type="button"
          onClick={props.onSelectAll}
          className="h-6 rounded border border-[var(--border-strong)] px-2 hover:bg-[var(--surface-5)]"
        >
          Select all
        </button>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={props.onClearSelection}
            className="h-6 rounded border border-[var(--border-strong)] px-2 hover:bg-[var(--surface-5)]"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Job functions">
        {view.plan.map((line) => {
          const now = staffed.get(line.functionCode) ?? 0;
          const need = line.requiredHeadcount != null ? Math.ceil(line.requiredHeadcount) : null;
          const projected =
            line.rate != null
              ? projectedVolume(
                  view.workers.map((w) => ({
                    segments: w.segments,
                    rampPercent: rampFor(w.zNumber, line.functionCode),
                  })),
                  line.functionCode,
                  line.rate,
                  view.breaks
                )
              : null;
          const planPct =
            projected != null && line.target ? Math.round((projected / line.target) * 100) : null;
          const short = need != null && now < need;
          return (
            <button
              key={line.functionCode}
              type="button"
              onClick={() => props.onFunctionClick(line.functionCode)}
              aria-pressed={focusCode === line.functionCode}
              title={`${line.label}${line.target != null ? ` — target ${line.target.toLocaleString()} ${line.unit ?? ''}${line.simulated ? ' (simulated)' : ''}` : ''}`}
              className={[
                'flex min-w-24 flex-col items-start rounded-md border px-2.5 py-1.5 text-left',
                focusCode === line.functionCode
                  ? 'border-[var(--info)] bg-[var(--info-bg)]'
                  : 'border-[var(--border-strong)] hover:bg-[var(--surface-5)]',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: colorFor(line.functionCode) }}
                />
                {line.functionCode}
              </span>
              <span
                className={[
                  'font-data text-xs',
                  short ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {now}
                {need != null ? ` / ${need}` : ''} staffed
              </span>
              {planPct != null && (
                <span className="text-[11px] text-[var(--text-muted)]">{planPct}% of plan</span>
              )}
            </button>
          );
        })}
        {[DOWNTIME_CODE, TIME_OFF_CODE].map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => props.onFunctionClick(code)}
            aria-pressed={focusCode === code}
            className={[
              'flex min-w-24 flex-col items-start rounded-md border px-2.5 py-1.5 text-left',
              focusCode === code
                ? 'border-[var(--info)] bg-[var(--info-bg)]'
                : 'border-[var(--border-strong)] hover:bg-[var(--surface-5)]',
            ].join(' ')}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: colorFor(code) }}
              />
              {functionLabel(code)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">reason required</span>
          </button>
        ))}
      </div>

      <div className={ROSTER_ROW_COLUMNS}>
        <span className="text-xs text-[var(--text-muted)]">Staffing at {clockText(at)}</span>
        <span className="text-center text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          Start
        </span>
        <div className="relative h-5">
          {hours.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 font-data text-[11px] text-[var(--text-muted)]"
              style={{ left: `${((t - view.window.start) / length) * 100}%` }}
            >
              {clockText(t)}
            </span>
          ))}
        </div>
        <span className="text-center text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          Finish
        </span>
      </div>
    </div>
  );
}
