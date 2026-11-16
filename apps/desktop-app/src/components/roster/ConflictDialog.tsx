import { useState } from 'react';
import type { Segment } from '@shared/workforce';
import { describeSection, functionLabel } from '../../lib/rosterFormat';
import { RosterDialog } from './RosterDialog';

/** A selected worker whose time is already partly or fully assigned. */
export interface BulkConflict {
  workerZ: string;
  name: string;
  existing: Segment[];
}

interface ConflictDialogProps {
  functionCode: string;
  conflicts: BulkConflict[];
  /** How many selected workers have no conflicts (they are filled either way). */
  clearCount: number;
  busy: boolean;
  error: string | null;
  onConfirm: (overrideWorkers: Set<string>) => void;
  onCancel: () => void;
}

/**
 * Bulk assign conflicts (#145): every selected worker who already has assigned time,
 * with what they have. Ticking Override replaces their whole scheduled time with the new
 * function; leaving it unticked only fills their unassigned time.
 */
export function ConflictDialog({
  functionCode,
  conflicts,
  clearCount,
  busy,
  error,
  onConfirm,
  onCancel,
}: ConflictDialogProps) {
  const [overrides, setOverrides] = useState<Set<string>>(new Set());

  function toggle(z: string) {
    setOverrides((current) => {
      const next = new Set(current);
      if (next.has(z)) next.delete(z);
      else next.add(z);
      return next;
    });
  }

  return (
    <RosterDialog
      title={`Assign ${functionLabel(functionCode)}`}
      confirmLabel="Confirm"
      confirmDisabled={busy}
      error={error}
      onConfirm={() => onConfirm(overrides)}
      onCancel={onCancel}
    >
      <p>
        {conflicts.length} selected{' '}
        {conflicts.length === 1 ? 'person already has' : 'people already have'} assigned time. Tick
        Override to replace their whole scheduled time; otherwise only their unassigned time is
        filled.
        {clearCount > 0 &&
          ` ${clearCount} other${clearCount === 1 ? '' : 's'} will be assigned for all their time.`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOverrides(new Set(conflicts.map((c) => c.workerZ)))}
          className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)]"
        >
          Override all
        </button>
        <button
          type="button"
          onClick={() => setOverrides(new Set())}
          className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)]"
        >
          Ignore all
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {conflicts.map((c) => (
          <li
            key={c.workerZ}
            className="flex items-start gap-3 border-t border-[var(--border-subtle)] py-2 first:border-t-0"
          >
            <label className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <input
                type="checkbox"
                checked={overrides.has(c.workerZ)}
                onChange={() => toggle(c.workerZ)}
                aria-label={`Override ${c.name}`}
              />
              Override
            </label>
            <div className="min-w-0">
              <p className="m-0 font-semibold">{c.name}</p>
              {c.existing.map((s, i) => (
                <p key={i} className="m-0 text-xs text-[var(--text-muted)]">
                  {describeSection(s)}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </RosterDialog>
  );
}
