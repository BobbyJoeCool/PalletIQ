import { useState } from 'react';
import type { AisleView } from '@shared/aisleSetup';
import { displayLocationId } from '@shared/location';
import { useAuth } from '../../context/authContext';
import { restoreCarveOut } from '../../lib/locationSetupApi';
import { locationSetupErrorText, reasonLabel } from '../../lib/locationSetupFormat';
import { ErrorBanner } from '../ui/ErrorBanner';

interface CarveOutListProps {
  view: AisleView;
  canRestore: boolean;
  onChanged: (view: AisleView) => void;
}

/** Every Not For Storage location in the aisle, with its reason and (for OM-level) Restore. */
export function CarveOutList({ view, canRestore, onChanged }: CarveOutListProps) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore(location: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await restoreCarveOut(token, location));
    } catch (err) {
      setError(locationSetupErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Not For Storage locations"
      className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-4"
    >
      <h2 className="text-sm font-semibold">Not For Storage ({view.carveOuts.length})</h2>
      {error && <ErrorBanner message={error} />}
      {view.carveOuts.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No locations in this aisle are carved out.
        </p>
      ) : (
        <ul className="m-0 flex max-h-64 list-none flex-col overflow-y-auto p-0">
          {view.carveOuts.map((c) => (
            <li
              key={c.location}
              className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] py-1.5 first:border-t-0"
            >
              <div className="min-w-0">
                <span className="font-data text-sm">{displayLocationId(c.location)}</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {reasonLabel(c.reason)}
                  {c.note ? `: ${c.note}` : ''}
                </span>
              </div>
              {canRestore && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void restore(c.location)}
                  className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-5)] disabled:opacity-40"
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
