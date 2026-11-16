import { Fragment, useEffect, useState } from 'react';
import type { GoalRow, ProdGoalsView } from '@shared/prodPlan';
import { useAuth } from '../../context/authContext';
import {
  cancelProdGoal,
  fetchProdGoals,
  prodPlanErrorText,
  setProdGoal,
} from '../../lib/prodPlanApi';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Section } from './Section';

const inputClass =
  'h-8 rounded border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]';

/** @returns "180 cartons/hr" (plus the secondary rate when there is one) */
function rateText(g: GoalRow): string {
  return `${g.rate} ${g.unit}${g.rate2 != null ? ` · ${g.rate2} ${g.unit2 ?? ''}` : ''}`;
}

/**
 * Prod Goal Setup (#146): each function's goal rate in force today, scheduled changes and
 * past rates. Rates are global. Only OM and Admin can change one — from a chosen date,
 * today or later — or cancel a change that hasn't started.
 */
export function ProdGoalSection({ canEdit }: { canEdit: boolean }) {
  const { token } = useAuth();
  const [view, setView] = useState<ProdGoalsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ code: string; rate: string; date: string } | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchProdGoals(token)
      .then(setView)
      .catch((err: unknown) => setError(prodPlanErrorText(err)));
  }, [token]);

  async function run(action: () => Promise<ProdGoalsView>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      setView(await action());
      after?.();
    } catch (err) {
      setError(prodPlanErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Prod Goals"
      aside={
        <span className="text-xs text-[var(--text-muted)]">
          Global — every department · {canEdit ? 'OM / Admin can change' : 'view only'}
        </span>
      }
    >
      {error && <ErrorBanner message={error} />}
      {!view && !error && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {view && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <th className="py-1 pr-3 font-semibold">Function</th>
              <th className="py-1 pr-3 font-semibold">Rate today</th>
              <th className="py-1 pr-3 font-semibold">Since</th>
              <th className="py-1 pr-3 font-semibold">Scheduled changes</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {view.functions.map((f) => (
              <Fragment key={f.functionCode}>
                <tr
                  key={f.functionCode}
                  className="border-t border-[var(--border-subtle)] align-top"
                >
                  <td className="py-2 pr-3">
                    <span className="font-semibold">{f.functionCode}</span>{' '}
                    <span className="text-[var(--text-muted)]">{f.label}</span>
                  </td>
                  <td className="py-2 pr-3 font-data">{f.current ? rateText(f.current) : '—'}</td>
                  <td className="py-2 pr-3 font-data text-[var(--text-muted)]">
                    {f.current?.effectiveDate ?? '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {f.upcoming.length === 0 && (
                      <span className="text-[var(--text-disabled)]">None</span>
                    )}
                    {f.upcoming.map((u) => (
                      <div key={u.id} className="flex items-center gap-2">
                        <span className="font-data">
                          {u.rate} from {u.effectiveDate}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => token && void run(() => cancelProdGoal(token, u.id))}
                            className="text-xs text-[var(--error)] underline"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {f.history.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setShowHistory(showHistory === f.functionCode ? null : f.functionCode)
                          }
                          className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)]"
                        >
                          History
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              code: f.functionCode,
                              rate: String(f.current?.rate ?? ''),
                              date: view.today,
                            })
                          }
                          className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)]"
                        >
                          Change
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {showHistory === f.functionCode && (
                  <tr key={`${f.functionCode}-history`}>
                    <td colSpan={5} className="pb-2 pl-4 text-xs text-[var(--text-muted)]">
                      {f.history.map((h) => (
                        <div key={h.id} className="font-data">
                          {h.effectiveDate}: {rateText(h)}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
                {editing?.code === f.functionCode && (
                  <tr key={`${f.functionCode}-edit`}>
                    <td colSpan={5} className="pb-3">
                      <form
                        className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--surface-4)] p-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (token)
                            void run(
                              () =>
                                setProdGoal(token, {
                                  functionCode: f.functionCode,
                                  rate: Number(editing.rate),
                                  effectiveDate: editing.date,
                                }),
                              () => setEditing(null)
                            );
                        }}
                      >
                        <label className="flex items-center gap-1.5 text-xs">
                          New rate
                          <input
                            aria-label={`${f.functionCode} new rate`}
                            value={editing.rate}
                            onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                            inputMode="decimal"
                            className={`${inputClass} w-24`}
                          />
                          <span className="text-[var(--text-muted)]">{f.current?.unit}</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs">
                          Effective
                          <input
                            type="date"
                            aria-label={`${f.functionCode} effective date`}
                            min={view.today}
                            value={editing.date}
                            onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={busy}
                          className="h-8 rounded bg-[var(--red-primary)] px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="h-8 rounded border border-[var(--border-strong)] px-3 text-xs"
                        >
                          Cancel
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
