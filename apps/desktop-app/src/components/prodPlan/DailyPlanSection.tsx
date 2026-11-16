import { useEffect, useState } from 'react';
import type { DailyPlanView } from '@shared/prodPlan';
import type { ShiftCode } from '@shared/workforce';
import { ATTENDANCE_CODES, isoDateOf, requiredHeadcount } from '@shared/workforce';
import { useAuth } from '../../context/authContext';
import { fetchDailyPlan, prodPlanErrorText, saveDailyPlan } from '../../lib/prodPlanApi';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Section } from './Section';

const inputClass =
  'h-8 rounded border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]';

/** @returns the label of an attendance code */
function attendanceLabel(code: string): string {
  return ATTENDANCE_CODES.find((a) => a.code === code)?.label ?? code;
}

/**
 * Daily Plan (#146): for a date and shift, the reference panels (company-wide Daily
 * Drop, this department's staffing net of whole-shift Time Off, other departments' net
 * headcount and targets) and this department's target per function. Reference numbers
 * inform but never limit what is entered. A blank target falls back to the simulated one
 * the roster uses.
 */
export function DailyPlanSection() {
  const { token } = useAuth();
  const [date, setDate] = useState(() => isoDateOf(new Date()));
  const [shift, setShift] = useState<ShiftCode | null>(null);
  const [view, setView] = useState<DailyPlanView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchDailyPlan(token, date, shift)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setDrafts(
          Object.fromEntries(
            v.lines.map((l) => [l.functionCode, l.target != null ? String(l.target) : ''])
          )
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(prodPlanErrorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, date, shift]);

  const dirty =
    view?.lines.some(
      (l) => (l.target != null ? String(l.target) : '') !== (drafts[l.functionCode] ?? '')
    ) ?? false;

  async function save() {
    if (!token || !view) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const targets = view.lines.map((l) => {
        const text = (drafts[l.functionCode] ?? '').replace(/,/g, '').trim();
        return { functionCode: l.functionCode, targetVolume: text === '' ? null : Number(text) };
      });
      const next = await saveDailyPlan(token, {
        date: view.date,
        shiftCode: view.shiftCode,
        targets,
      });
      setView(next);
      setDrafts(
        Object.fromEntries(
          next.lines.map((l) => [l.functionCode, l.target != null ? String(l.target) : ''])
        )
      );
      setSaved(true);
    } catch (err) {
      setError(prodPlanErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const shiftButton = (code: string, label: string) => (
    <button
      type="button"
      onClick={() => setShift(code as ShiftCode)}
      aria-pressed={view?.shiftCode === code}
      className={[
        'h-8 px-3 text-sm font-medium',
        view?.shiftCode === code
          ? 'bg-[var(--red-primary)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-5)]',
      ].join(' ')}
    >
      {label} ({code})
    </button>
  );

  return (
    <Section
      title="Daily Plan"
      aside={
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Plan date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setShift(null);
              }
            }}
            className={inputClass}
          />
          {view && (
            <div
              className="flex overflow-hidden rounded border border-[var(--border-strong)]"
              role="group"
              aria-label="Plan shift"
            >
              {shiftButton(view.shiftsOnDate.day, 'Day')}
              {shiftButton(view.shiftsOnDate.night, 'Night')}
            </div>
          )}
        </div>
      }
    >
      {error && <ErrorBanner message={error} />}
      {!view && !error && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {view && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-md bg-[var(--surface-4)] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Daily Drop (company-wide, simulated)
              </h3>
              <ul className="m-0 mt-2 list-none p-0 text-sm">
                {view.drop.map((d) => (
                  <li key={d.functionCode} className="flex justify-between font-data">
                    <span>{d.functionCode}</span>
                    <span>
                      {d.volume.toLocaleString()} {d.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md bg-[var(--surface-4)] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {view.departmentId} staffing ({view.shiftCode})
              </h3>
              <p className="m-0 mt-2 text-sm">Scheduled {view.staffing.scheduled}</p>
              {view.staffing.out.map((o) => (
                <p key={o.code} className="m-0 text-sm text-[var(--warning)]">
                  − {o.count} {attendanceLabel(o.code)} ({o.code})
                </p>
              ))}
              <p className="m-0 mt-1 text-base font-semibold">Net available {view.staffing.net}</p>
            </div>
            <div className="rounded-md bg-[var(--surface-4)] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Other departments
              </h3>
              {view.otherDepartments.length === 0 && (
                <p className="m-0 mt-2 text-sm text-[var(--text-muted)]">
                  No other department is staffed this shift.
                </p>
              )}
              {view.otherDepartments.map((d) => (
                <div key={d.departmentId} className="mt-2 text-sm">
                  <span className="font-semibold">{d.name}</span> — net {d.net}
                  {d.targets.map((t) => (
                    <span
                      key={t.functionCode}
                      className="ml-2 font-data text-xs text-[var(--text-muted)]"
                    >
                      {t.functionCode} {t.targetVolume.toLocaleString()}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-1 pr-3 font-semibold">Function</th>
                <th className="py-1 pr-3 font-semibold">Goal</th>
                <th className="py-1 pr-3 font-semibold">Target</th>
                <th className="py-1 pr-3 font-semibold">Needs</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l) => {
                const text = (drafts[l.functionCode] ?? '').replace(/,/g, '').trim();
                const entered = text === '' ? null : Number(text);
                const effective = entered ?? l.simulatedTarget;
                const need =
                  effective != null && l.rate != null && Number.isFinite(effective)
                    ? requiredHeadcount(effective, l.rate, view.productiveHours)
                    : null;
                return (
                  <tr key={l.functionCode} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 pr-3">
                      <span className="font-semibold">{l.functionCode}</span>{' '}
                      <span className="text-[var(--text-muted)]">{l.label}</span>
                    </td>
                    <td className="py-1.5 pr-3 font-data text-[var(--text-muted)]">
                      {l.rate != null ? `${l.rate}/hr` : 'no goal'}
                    </td>
                    <td className="py-1.5 pr-3">
                      {l.rate != null ? (
                        <span className="flex items-center gap-2">
                          <input
                            aria-label={`${l.functionCode} target`}
                            value={drafts[l.functionCode] ?? ''}
                            onChange={(e) => {
                              setSaved(false);
                              setDrafts({ ...drafts, [l.functionCode]: e.target.value });
                            }}
                            inputMode="numeric"
                            placeholder={
                              l.simulatedTarget != null
                                ? `${l.simulatedTarget.toLocaleString()} (simulated)`
                                : ''
                            }
                            className={`${inputClass} w-44`}
                          />
                          <span className="text-xs text-[var(--text-muted)]">{l.unit}</span>
                        </span>
                      ) : (
                        <span className="text-[var(--text-disabled)]">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-data">
                      {need != null ? `${Math.ceil(need)} people` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="h-9 rounded-md bg-[var(--red-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save targets
            </button>
            {saved && (
              <span role="status" className="text-sm text-[var(--success)]">
                Saved
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              Leave a target blank to use the simulated one.
            </span>
          </div>
        </>
      )}
    </Section>
  );
}
