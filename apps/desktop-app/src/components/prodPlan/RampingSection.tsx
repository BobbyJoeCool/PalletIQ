import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../context/authContext';
import {
  addRamping,
  editRamping,
  fetchRamping,
  prodPlanErrorText,
  removeRamping,
} from '../../lib/prodPlanApi';
import type { RampingData } from '../../lib/prodPlanApi';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Section } from './Section';

const inputClass =
  'h-8 rounded border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]';

/**
 * Ramping overrides (#146): team members producing at a share of a function's goal while
 * they ramp up. Current and upcoming overrides for the viewer's department are listed;
 * LWW, OM and Admin can add, change (percent, dates), end today, or remove one. One
 * override per worker and function at a time.
 */
export function RampingSection() {
  const { token } = useAuth();
  const [data, setData] = useState<RampingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workerText, setWorkerText] = useState('');
  const [functionCode, setFunctionCode] = useState('');
  const [percent, setPercent] = useState('75');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!token) return;
    fetchRamping(token)
      .then((d) => {
        setData(d);
        setStartDate(d.today);
      })
      .catch((err: unknown) => setError(prodPlanErrorText(err)));
  }, [token]);

  async function run(action: () => Promise<RampingData>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      setData(await action());
      after?.();
    } catch (err) {
      setError(prodPlanErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  /** The worker picked in the type-ahead box: matched by "Last, First (zNumber)" or a bare zNumber. */
  const pickedWorker = data?.workers.find(
    (w) =>
      workerText === `${w.lastName}, ${w.firstName} (${w.zNumber})` ||
      workerText.trim().toLowerCase() === w.zNumber
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !pickedWorker || !functionCode) return;
    void run(
      () =>
        addRamping(token, {
          workerZ: pickedWorker.zNumber,
          functionCode,
          percent: Number(percent),
          startDate,
          endDate: endDate || null,
        }),
      () => {
        setWorkerText('');
        setEndDate('');
      }
    );
  }

  return (
    <Section title="Ramping">
      {error && <ErrorBanner message={error} />}
      {!data && !error && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {data && (
        <>
          <form
            onSubmit={submit}
            className="flex flex-wrap items-end gap-2 rounded-md bg-[var(--surface-4)] p-3"
          >
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Worker
              <input
                aria-label="Ramping worker"
                list="ramping-workers"
                value={workerText}
                onChange={(e) => setWorkerText(e.target.value)}
                placeholder="Type a name or zNumber"
                className={`${inputClass} w-64`}
              />
              <datalist id="ramping-workers">
                {data.workers.map((w) => (
                  <option key={w.zNumber} value={`${w.lastName}, ${w.firstName} (${w.zNumber})`} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Function
              <select
                aria-label="Ramping function"
                value={functionCode}
                onChange={(e) => setFunctionCode(e.target.value)}
                className={inputClass}
              >
                <option value="">Choose…</option>
                {data.functions.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.code} — {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              % of goal
              <input
                aria-label="Ramping percent"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                inputMode="numeric"
                className={`${inputClass} w-16 font-data`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Starts
              <input
                type="date"
                aria-label="Ramping start"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Ends (optional)
              <input
                type="date"
                aria-label="Ramping end"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !pickedWorker || !functionCode}
              className="h-8 rounded bg-[var(--red-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
          </form>

          {data.overrides.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Nobody in your department is ramping.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-1 pr-3 font-semibold">Worker</th>
                  <th className="py-1 pr-3 font-semibold">Function</th>
                  <th className="py-1 pr-3 font-semibold">% of goal</th>
                  <th className="py-1 pr-3 font-semibold">Dates</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {data.overrides.map((o) => (
                  <tr key={o.id} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 pr-3">
                      {o.lastName}, {o.firstName}{' '}
                      <span className="font-data text-xs text-[var(--text-muted)]">
                        {o.workerZ}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-semibold">{o.functionCode}</td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`${o.firstName} ${o.lastName} ${o.functionCode} percent`}
                        defaultValue={o.percent}
                        inputMode="numeric"
                        onBlur={(e) => {
                          const value = Number(e.target.value);
                          if (token && value !== o.percent)
                            void run(() => editRamping(token, o.id, { percent: value }));
                        }}
                        className={`${inputClass} w-16 font-data`}
                      />
                    </td>
                    <td className="py-1.5 pr-3 font-data text-xs">
                      {o.startDate} – {o.endDate ?? 'ongoing'}
                      {o.startDate > data.today && (
                        <span className="ml-2 text-[var(--info)]">upcoming</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <div className="flex justify-end gap-2">
                        {o.startDate <= data.today && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              token &&
                              void run(() => editRamping(token, o.id, { endDate: data.today }))
                            }
                            className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)]"
                          >
                            End today
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => token && void run(() => removeRamping(token, o.id))}
                          className="h-7 rounded border border-[var(--error-border)] px-2 text-xs text-[var(--error)] hover:bg-[var(--error-bg)]"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Section>
  );
}
