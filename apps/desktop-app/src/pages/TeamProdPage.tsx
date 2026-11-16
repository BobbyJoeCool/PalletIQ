import { useEffect, useState } from 'react';
import type { TeamProdView } from '@shared/teamProd';
import type { ShiftCode } from '@shared/workforce';
import { isoDateOf } from '@shared/workforce';
import { FunctionCard } from '../components/teamProd/FunctionCard';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useAuth } from '../context/authContext';
import { clockText } from '../lib/rosterFormat';
import { fetchTeamProd } from '../lib/teamProdApi';

/** How often a live shift refreshes. */
const REFRESH_MS = 60_000;

/**
 * Team Prod Summary (#147): actual production against plan for a date and shift, a card
 * per function — pull and production functions with gauges, scan-tracked functions with
 * counts, Downtime with headcount. Refreshes every minute while the shift is running; a
 * past shift is a static snapshot. Read-only; every desktop user.
 */
export function TeamProdPage() {
  const { token } = useAuth();
  const [date, setDate] = useState(() => isoDateOf(new Date()));
  const [shift, setShift] = useState<ShiftCode | null>(null);
  const [result, setResult] = useState<{
    key: string;
    view: TeamProdView | null;
    error: string | null;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const key = `${date}|${shift ?? ''}`;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchTeamProd(token, date, shift)
      .then((view) => {
        if (!cancelled) setResult({ key, view, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setResult({
            key,
            view: null,
            error: err instanceof Error ? err.message : 'REQUEST_FAILED',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [token, date, shift, key, tick]);

  const current = result?.key === key ? result : null;
  const view = current?.view ?? null;

  // Live refresh while the shift is running.
  useEffect(() => {
    if (!view?.live) return;
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [view?.live]);

  const tracked = view?.cards.filter((c) => c.tier !== 'OTHER') ?? [];
  const elapsedPct = view
    ? ((view.asOf - view.window.start) / (view.window.end - view.window.start)) * 100
    : 100;
  const other = view?.cards.filter((c) => c.tier === 'OTHER') ?? [];

  const shiftButton = (code: string, label: string) => (
    <button
      type="button"
      onClick={() => setShift(code as ShiftCode)}
      aria-pressed={view?.shiftCode === code}
      className={[
        'h-9 px-3 text-sm font-medium',
        view?.shiftCode === code
          ? 'bg-[var(--red-primary)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-5)]',
      ].join(' ')}
    >
      {label} ({code})
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Team Prod Summary</h1>
          {view && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {view.departmentId} ·{' '}
              {view.live
                ? `live, as of ${clockText(view.asOf)} — refreshes every minute`
                : `as of ${clockText(view.asOf)}`}
            </p>
          )}
        </div>
        <div className="flex items-end gap-3">
          <input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setShift(null);
              }
            }}
            className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)]"
          />
          {view && (
            <div
              className="flex overflow-hidden rounded-md border border-[var(--border-strong)]"
              role="group"
              aria-label="Shift"
            >
              {shiftButton(view.shiftsOnDate.day, 'Day')}
              {shiftButton(view.shiftsOnDate.night, 'Night')}
            </div>
          )}
        </div>
      </div>

      {!current && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {current?.error && (
        <ErrorBanner
          message={
            current.error === 'NO_DESKTOP_ACCESS'
              ? 'This account does not have desktop access.'
              : 'Team Prod Summary could not be loaded. Check that the API is running.'
          }
        />
      )}
      {view?.departmentNote && (
        <p className="text-sm text-[var(--warning)]">{view.departmentNote}</p>
      )}

      {view && (
        <>
          <section aria-label="Scan-tracked functions" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Scan-tracked functions
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tracked
                .filter((c) => c.tier !== 'SCAN')
                .map((c) => (
                  <FunctionCard key={c.functionCode} card={c} elapsedPct={elapsedPct} />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {tracked
                .filter((c) => c.tier === 'SCAN')
                .map((c) => (
                  <FunctionCard key={c.functionCode} card={c} elapsedPct={elapsedPct} />
                ))}
            </div>
          </section>
          <section aria-label="Other functions" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Other functions
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {other.map((c) => (
                <FunctionCard key={c.functionCode} card={c} elapsedPct={elapsedPct} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
