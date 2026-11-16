import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { RosterView, RosterWorker, Segment, ShiftCode, TimeSpan } from '@shared/workforce';
import {
  DOWNTIME_CODE,
  TIME_OFF_CODE,
  fillGaps,
  isoDateOf,
  overlaySegment,
  segmentsIn,
} from '@shared/workforce';
import { hasMinRole } from '@shared/roles';
import type { Role } from '@shared/roles';
import { ConflictDialog } from '../components/roster/ConflictDialog';
import type { BulkConflict } from '../components/roster/ConflictDialog';
import { ReasonDialog } from '../components/roster/ReasonDialog';
import { RosterHeader } from '../components/roster/RosterHeader';
import { SectionDialog } from '../components/roster/SectionDialog';
import { SplitDialog } from '../components/roster/SplitDialog';
import { WorkerRow } from '../components/roster/WorkerRow';
import type { Work } from '../lib/rosterWork';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useAuth } from '../context/authContext';
import { rosterErrorText } from '../lib/rosterFormat';
import { useRoster } from '../lib/useRoster';

/** What dialog, if any, is open. */
type DialogState =
  | {
      kind: 'section';
      workerZ: string;
      target: { kind: 'section'; section: Segment } | { kind: 'gap'; span: TimeSpan };
    }
  | { kind: 'split'; workerZ: string; section: Segment; at: number }
  | { kind: 'reason'; functionCode: string }
  | { kind: 'conflict'; work: Work; conflicts: BulkConflict[]; clearCount: number };

/** How long the "Saved" note stays up. */
const TOAST_MS = 2_000;

/** @returns the span a worker can be assigned in: their schedule, or the whole shift if unscheduled */
function assignableSpan(worker: RosterWorker, view: RosterView): TimeSpan {
  return worker.scheduled ?? view.window;
}

/**
 * Job/Function Assignment (#145): the shift roster as a timeline, one bar per team member.
 *
 * - To start the day, select names and click a function in the header to assign their
 *   unassigned time; if any already have time assigned, a dialog lists every conflict
 *   with an Override checkbox each.
 * - Drag a section's edge, or type the start / finish time, to change it. Click a
 *   section to edit it; double-click to split it; click a hatched stretch to assign it.
 * - With nobody selected, a function calls up everyone who worked it (they sort to the
 *   top and the rest of their bars dim).
 *
 * LWW, OM and Admin only; ICQA does not get this screen unless they hold one of those roles.
 */
export function JobAssignmentPage() {
  const { user } = useAuth();
  const allowed = user ? hasMinRole(user.role as Role, 'LEAD') : false;
  const [date, setDate] = useState(() => isoDateOf(new Date()));
  const [shift, setShift] = useState<ShiftCode | null>(null);
  const { state, save } = useRoster(date, shift);
  const view = state.status === 'ready' ? state.view : null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Keep the "now" line moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Workers in display order: the called-up function's workers first. */
  const workers = useMemo(() => {
    if (!view) return [];
    if (!focusCode) return view.workers;
    const has = (w: RosterWorker) => w.segments.some((s) => s.functionCode === focusCode);
    return [...view.workers.filter(has), ...view.workers.filter((w) => !has(w))];
  }, [view, focusCode]);

  if (!allowed) {
    return (
      <ErrorBanner message="Job/Function Assignment is limited to LWW, OM and System Admin." />
    );
  }

  const staffingAt = view
    ? (hoverT ?? (now > view.window.start && now < view.window.end ? now : view.window.start))
    : 0;
  const workerName = (z: string) => {
    const w = view?.workers.find((x) => x.zNumber === z);
    return w ? `${w.firstName} ${w.lastName}` : z;
  };

  /** Saves new timelines; reports success as a toast and failure in the given setter. */
  async function commit(
    timelines: { workerZ: string; segments: Segment[] }[],
    onError: (message: string) => void = setError
  ): Promise<boolean> {
    if (!view || timelines.length === 0) return false;
    setBusy(true);
    setError(null);
    try {
      await save(view, timelines);
      setToast('Saved');
      return true;
    } catch (err) {
      onError(rosterErrorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Saves from inside a dialog; closes it on success, keeps it open with the error otherwise. */
  async function commitFromDialog(workerZ: string, segments: Segment[]) {
    setDialogError(null);
    if (await commit([{ workerZ, segments }], setDialogError)) setDialog(null);
  }

  function selectName(event: MouseEvent, z: string) {
    if (!view) return;
    const order = workers.map((w) => w.zNumber);
    if (event.shiftKey && anchorRef.current) {
      const [a, b] = [order.indexOf(anchorRef.current), order.indexOf(z)].sort((x, y) => x - y);
      setSelected(new Set(order.slice(a, b + 1)));
      return;
    }
    anchorRef.current = z;
    setSelected((current) => {
      const next = new Set(event.ctrlKey || event.metaKey ? current : []);
      if (current.has(z) && (event.ctrlKey || event.metaKey || current.size === 1)) next.delete(z);
      else next.add(z);
      return next;
    });
  }

  function clickFunction(code: string) {
    if (!view) return;
    if (selected.size === 0) {
      setFocusCode((current) => (current === code ? null : code));
      return;
    }
    if (code === DOWNTIME_CODE || code === TIME_OFF_CODE) {
      setDialog({ kind: 'reason', functionCode: code });
      return;
    }
    startBulk({ functionCode: code, reasonCode: null, reasonText: null });
  }

  /** Bulk assign: fills unassigned time, or asks about everyone who already has some. */
  function startBulk(work: Work) {
    if (!view) return;
    const chosen = view.workers.filter((w) => selected.has(w.zNumber));
    const conflicts: BulkConflict[] = chosen
      .map((w) => ({
        workerZ: w.zNumber,
        name: `${w.lastName}, ${w.firstName}`,
        existing: segmentsIn(w.segments, assignableSpan(w, view)),
      }))
      .filter((c) => c.existing.length > 0);
    if (conflicts.length === 0) {
      setDialog(null);
      void applyBulk(work, new Set());
      return;
    }
    setDialogError(null);
    setDialog({ kind: 'conflict', work, conflicts, clearCount: chosen.length - conflicts.length });
  }

  async function applyBulk(work: Work, overrides: Set<string>) {
    if (!view) return;
    const timelines = view.workers
      .filter((w) => selected.has(w.zNumber))
      .map((w) => {
        const span = assignableSpan(w, view);
        const segments = overrides.has(w.zNumber)
          ? overlaySegment(w.segments, { ...span, ...work })
          : fillGaps(w.segments, span, work);
        return { workerZ: w.zNumber, segments };
      });
    setDialogError(null);
    if (await commit(timelines, setDialogError)) {
      setDialog(null);
      setSelected(new Set());
    }
  }

  const functionCodes = view?.plan.map((p) => p.functionCode) ?? [];

  return (
    <div className="flex flex-col gap-3">
      {view && (
        <RosterHeader
          view={view}
          date={date}
          onDateChange={(d) => {
            setDate(d);
            setShift(null);
            setSelected(new Set());
          }}
          onShiftChange={(s) => {
            setShift(s);
            setSelected(new Set());
          }}
          staffingAt={staffingAt}
          selectedCount={selected.size}
          focusCode={focusCode}
          onFunctionClick={clickFunction}
          onSelectAll={() => setSelected(new Set(workers.map((w) => w.zNumber)))}
          onClearSelection={() => setSelected(new Set())}
        />
      )}

      {state.status === 'loading' && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {state.status === 'error' && (
        <ErrorBanner message={rosterErrorText(new Error(state.errorCode))} />
      )}
      {error && <ErrorBanner message={error} />}
      {view && view.plan.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          No job functions are defined for your department yet.
        </p>
      )}

      {view && (
        <div role="list" aria-label="Roster">
          {workers.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">Nobody is scheduled for this shift.</p>
          )}
          {workers.map((w) => (
            <div role="listitem" key={w.zNumber}>
              <WorkerRow
                worker={w}
                shiftCode={view.shiftCode}
                date={view.date}
                window={view.window}
                breaks={view.breaks}
                selected={selected.has(w.zNumber)}
                focusCode={focusCode}
                now={now}
                busy={busy}
                onSelect={(e) => selectName(e, w.zNumber)}
                onCommit={(segments) => void commit([{ workerZ: w.zNumber, segments }])}
                onSectionClick={(section) => {
                  setDialogError(null);
                  setDialog({
                    kind: 'section',
                    workerZ: w.zNumber,
                    target: { kind: 'section', section },
                  });
                }}
                onSectionDoubleClick={(section, at) => {
                  setDialogError(null);
                  setDialog({ kind: 'split', workerZ: w.zNumber, section, at });
                }}
                onGapClick={(span) => {
                  setDialogError(null);
                  setDialog({ kind: 'section', workerZ: w.zNumber, target: { kind: 'gap', span } });
                }}
                onHover={setHoverT}
              />
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-2 text-sm text-[var(--success)]"
        >
          {toast}
        </div>
      )}

      {view && dialog?.kind === 'section' && (
        <SectionDialog
          workerName={workerName(dialog.workerZ)}
          shiftCode={view.shiftCode}
          date={view.date}
          window={view.window}
          functionCodes={functionCodes}
          segments={view.workers.find((w) => w.zNumber === dialog.workerZ)?.segments ?? []}
          target={dialog.target}
          busy={busy}
          error={dialogError}
          onSave={(segments) => void commitFromDialog(dialog.workerZ, segments)}
          onCancel={() => setDialog(null)}
        />
      )}
      {view && dialog?.kind === 'split' && (
        <SplitDialog
          workerName={workerName(dialog.workerZ)}
          shiftCode={view.shiftCode}
          date={view.date}
          window={view.window}
          functionCodes={functionCodes}
          segments={view.workers.find((w) => w.zNumber === dialog.workerZ)?.segments ?? []}
          section={dialog.section}
          at={dialog.at}
          busy={busy}
          error={dialogError}
          onSave={(segments) => void commitFromDialog(dialog.workerZ, segments)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'reason' && (
        <ReasonDialog
          functionCode={dialog.functionCode}
          count={selected.size}
          onConfirm={startBulk}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'conflict' && (
        <ConflictDialog
          functionCode={dialog.work.functionCode}
          conflicts={dialog.conflicts}
          clearCount={dialog.clearCount}
          busy={busy}
          error={dialogError}
          onConfirm={(overrides) => void applyBulk(dialog.work, overrides)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
