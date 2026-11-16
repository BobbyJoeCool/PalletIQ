import { useState } from 'react';
import type { Segment, ShiftCode, TimeSpan } from '@shared/workforce';
import { clearSpan, overlaySegment } from '@shared/workforce';
import { spanText } from '../../lib/rosterFormat';
import { RosterDialog } from './RosterDialog';
import { ShiftTimeInput } from './ShiftTimeInput';
import { workIsComplete } from '../../lib/rosterWork';
import type { Work } from '../../lib/rosterWork';
import { WorkPicker } from './WorkPicker';

interface SectionDialogProps {
  workerName: string;
  shiftCode: ShiftCode;
  date: string;
  window: TimeSpan;
  functionCodes: readonly string[];
  segments: Segment[];
  /** The section clicked, or an unassigned span to fill. */
  target: { kind: 'section'; section: Segment } | { kind: 'gap'; span: TimeSpan };
  busy: boolean;
  error: string | null;
  onSave: (segments: Segment[]) => void;
  onCancel: () => void;
}

/**
 * Edits one section of a worker's timeline, or assigns an unassigned stretch (#145):
 * what it is, and its start and end. Widening it takes time from its neighbours; Clear
 * leaves its time unassigned.
 */
export function SectionDialog({
  workerName,
  shiftCode,
  date,
  window,
  functionCodes,
  segments,
  target,
  busy,
  error,
  onSave,
  onCancel,
}: SectionDialogProps) {
  const original = target.kind === 'section' ? target.section : null;
  const span = original ?? (target.kind === 'gap' ? target.span : window);
  const [work, setWork] = useState<Work>(
    original
      ? {
          functionCode: original.functionCode,
          reasonCode: original.reasonCode,
          reasonText: original.reasonText,
        }
      : { functionCode: '', reasonCode: null, reasonText: null }
  );
  const [start, setStart] = useState(span.start);
  const [end, setEnd] = useState(span.end);

  const timesOk = start < end && start >= window.start && end <= window.end;

  function save() {
    const base = original ? clearSpan(segments, original) : segments;
    onSave(
      overlaySegment(base, { start, end, ...work, reasonText: work.reasonText?.trim() || null })
    );
  }

  return (
    <RosterDialog
      title={
        original
          ? `${workerName}: ${spanText(original)}`
          : `${workerName}: assign ${spanText(span)}`
      }
      confirmLabel="Save"
      confirmDisabled={busy || !timesOk || !workIsComplete(work)}
      error={error ?? (!timesOk ? 'The section must end after it starts, inside the shift.' : null)}
      onConfirm={save}
      onCancel={onCancel}
      extra={
        original && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(clearSpan(segments, original))}
            className="h-9 rounded-md border border-[var(--border-strong)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-5)]"
          >
            Clear section
          </button>
        )
      }
    >
      <WorkPicker label="Section" functionCodes={functionCodes} value={work} onChange={setWork} />
      <div className="flex items-center gap-2">
        <ShiftTimeInput
          label="Section start"
          shiftCode={shiftCode}
          date={date}
          value={start}
          onChange={setStart}
        />
        <span>to</span>
        <ShiftTimeInput
          label="Section end"
          shiftCode={shiftCode}
          date={date}
          value={end}
          onChange={setEnd}
        />
      </div>
    </RosterDialog>
  );
}
