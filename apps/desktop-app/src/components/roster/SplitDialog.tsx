import { useState } from 'react';
import type { Segment, ShiftCode, TimeSpan } from '@shared/workforce';
import { applySplit } from '@shared/workforce';
import { functionLabel, spanText } from '../../lib/rosterFormat';
import { RosterDialog } from './RosterDialog';
import { ShiftTimeInput } from './ShiftTimeInput';
import { workIsComplete } from '../../lib/rosterWork';
import type { Work } from '../../lib/rosterWork';
import { WorkPicker } from './WorkPicker';

interface SplitDialogProps {
  workerName: string;
  shiftCode: ShiftCode;
  date: string;
  window: TimeSpan;
  functionCodes: readonly string[];
  segments: Segment[];
  section: Segment;
  /** Where the bar was double-clicked, already snapped. */
  at: number;
  busy: boolean;
  error: string | null;
  onSave: (segments: Segment[]) => void;
  onCancel: () => void;
}

/**
 * Splits a section in two (#145, opened by double-clicking the bar). The split time
 * starts where the bar was clicked; before and after start out doing what the section
 * did. Any of the split time, the before section's start and function, and the after
 * section's end and function can be changed before confirming.
 */
export function SplitDialog({
  workerName,
  shiftCode,
  date,
  window,
  functionCodes,
  segments,
  section,
  at,
  busy,
  error,
  onSave,
  onCancel,
}: SplitDialogProps) {
  const sameWork: Work = {
    functionCode: section.functionCode,
    reasonCode: section.reasonCode,
    reasonText: section.reasonText,
  };
  const [splitAt, setSplitAt] = useState(at);
  const [beforeStart, setBeforeStart] = useState(section.start);
  const [afterEnd, setAfterEnd] = useState(section.end);
  const [before, setBefore] = useState<Work>(sameWork);
  const [after, setAfter] = useState<Work>(sameWork);

  const inShift = beforeStart >= window.start && afterEnd <= window.end;
  const ordered = beforeStart < splitAt && splitAt < afterEnd;
  const result =
    ordered && inShift
      ? applySplit(segments, {
          original: section,
          splitAt,
          before: { start: beforeStart, ...before, reasonText: before.reasonText?.trim() || null },
          after: { end: afterEnd, ...after, reasonText: after.reasonText?.trim() || null },
        })
      : null;

  return (
    <RosterDialog
      title={`Split ${workerName}: ${functionLabel(section.functionCode)} ${spanText(section)}`}
      confirmLabel="Confirm"
      confirmDisabled={busy || !result || !workIsComplete(before) || !workIsComplete(after)}
      error={
        error ??
        (!ordered || !inShift
          ? 'The split must fall between the before start and the after end, inside the shift.'
          : null)
      }
      onConfirm={() => result && onSave(result)}
      onCancel={onCancel}
    >
      <label className="flex items-center gap-2">
        <span className="w-20 font-semibold">Split at</span>
        <ShiftTimeInput
          label="Split time"
          shiftCode={shiftCode}
          date={date}
          value={splitAt}
          onChange={setSplitAt}
        />
      </label>
      <fieldset className="flex flex-col gap-2 rounded-md border border-[var(--border-default)] p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Before
        </legend>
        <div className="flex items-center gap-2">
          <span className="w-20">Starts</span>
          <ShiftTimeInput
            label="Before start"
            shiftCode={shiftCode}
            date={date}
            value={beforeStart}
            onChange={setBeforeStart}
          />
        </div>
        <WorkPicker
          label="Before"
          functionCodes={functionCodes}
          value={before}
          onChange={setBefore}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-2 rounded-md border border-[var(--border-default)] p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          After
        </legend>
        <div className="flex items-center gap-2">
          <span className="w-20">Ends</span>
          <ShiftTimeInput
            label="After end"
            shiftCode={shiftCode}
            date={date}
            value={afterEnd}
            onChange={setAfterEnd}
          />
        </div>
        <WorkPicker label="After" functionCodes={functionCodes} value={after} onChange={setAfter} />
      </fieldset>
    </RosterDialog>
  );
}
