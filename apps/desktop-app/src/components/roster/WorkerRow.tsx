import type { MouseEvent } from 'react';
import type { RosterWorker, Segment, ShiftCode, TimeSpan } from '@shared/workforce';
import { clearSpan, gapsIn, overlaySegment } from '@shared/workforce';
import { spanText } from '../../lib/rosterFormat';
import { ShiftTimeInput } from './ShiftTimeInput';
import { TimelineBar } from './TimelineBar';

interface WorkerRowProps {
  worker: RosterWorker;
  shiftCode: ShiftCode;
  date: string;
  window: TimeSpan;
  breaks: TimeSpan[];
  selected: boolean;
  focusCode: string | null;
  now: number | null;
  busy: boolean;
  onSelect: (event: MouseEvent) => void;
  onCommit: (segments: Segment[]) => void;
  onSectionClick: (section: Segment) => void;
  onSectionDoubleClick: (section: Segment, at: number) => void;
  onGapClick: (span: TimeSpan) => void;
  onHover: (t: number | null) => void;
}

/** The grid columns every row and the time axis share. */
export const ROSTER_ROW_COLUMNS =
  'grid grid-cols-[15rem_7rem_minmax(0,1fr)_7rem] items-center gap-2';

/**
 * One team member on the roster (#145): their name (click / Shift-click / Ctrl-click to
 * select), ramping badges and schedule; a start box, the timeline bar and a finish box.
 * Moving the start earlier extends their first section back; later clears that time.
 * The finish box works the same way at the other end. A warning marks unassigned
 * scheduled time.
 */
export function WorkerRow(props: WorkerRowProps) {
  const { worker, shiftCode, date, window, selected, busy } = props;
  const segments = worker.segments;
  const first = segments[0];
  const last = segments[segments.length - 1];
  const hasGaps = worker.scheduled != null && gapsIn(segments, worker.scheduled).length > 0;

  function changeStart(t: number) {
    if (!first || t === first.start || t < window.start || t >= last.end) return;
    props.onCommit(
      t < first.start
        ? overlaySegment(segments, { ...first, start: t, end: first.start })
        : clearSpan(segments, { start: first.start, end: t })
    );
  }

  function changeFinish(t: number) {
    if (!last || t === last.end || t > window.end || t <= first.start) return;
    props.onCommit(
      t > last.end
        ? overlaySegment(segments, { ...last, start: last.end, end: t })
        : clearSpan(segments, { start: t, end: last.end })
    );
  }

  return (
    <div
      className={[
        ROSTER_ROW_COLUMNS,
        'border-t border-[var(--border-subtle)] py-1.5',
        selected ? 'bg-[var(--info-bg)]' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={props.onSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-col items-start rounded px-2 py-1 text-left hover:bg-[var(--surface-5)]"
      >
        <span className="flex w-full items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {worker.lastName}, {worker.firstName}
          </span>
          {hasGaps && (
            <span title="Unassigned scheduled time" className="text-xs text-[var(--warning)]">
              ⚠
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-muted)]">
          <span className="font-data">{worker.zNumber}</span>
          <span>{worker.scheduled ? spanText(worker.scheduled) : 'not scheduled'}</span>
          {worker.ramping.map((r) => (
            <span
              key={r.functionCode}
              className="rounded bg-[var(--warning-bg)] px-1 font-semibold text-[var(--warning)]"
              title={`Ramping on ${r.functionCode} at ${r.percent}% of goal`}
            >
              RAMP {r.functionCode} {r.percent}%
            </span>
          ))}
        </span>
      </button>

      {first ? (
        <ShiftTimeInput
          label={`${worker.firstName} ${worker.lastName} start`}
          shiftCode={shiftCode}
          date={date}
          value={first.start}
          onChange={changeStart}
          className="h-8 w-full rounded border border-[var(--border-strong)] bg-[var(--surface-2)] px-1.5 font-data text-xs text-[var(--text-primary)]"
        />
      ) : (
        <span className="text-center text-xs text-[var(--text-disabled)]">—</span>
      )}

      <TimelineBar
        workerName={`${worker.firstName} ${worker.lastName}`}
        window={window}
        breaks={props.breaks}
        scheduled={worker.scheduled}
        segments={segments}
        focusCode={props.focusCode}
        now={props.now}
        disabled={busy}
        onCommit={props.onCommit}
        onSectionClick={props.onSectionClick}
        onSectionDoubleClick={props.onSectionDoubleClick}
        onGapClick={props.onGapClick}
        onHover={props.onHover}
      />

      {last ? (
        <ShiftTimeInput
          label={`${worker.firstName} ${worker.lastName} finish`}
          shiftCode={shiftCode}
          date={date}
          value={last.end}
          onChange={changeFinish}
          className="h-8 w-full rounded border border-[var(--border-strong)] bg-[var(--surface-2)] px-1.5 font-data text-xs text-[var(--text-primary)]"
        />
      ) : (
        <span className="text-center text-xs text-[var(--text-disabled)]">—</span>
      )}
    </div>
  );
}
