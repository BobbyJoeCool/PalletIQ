import { useCallback, useEffect, useState } from 'react';
import type {
  AisleView,
  CellLocationView,
  NotForStorageReason,
  ZoneCellKey,
} from '@shared/aisleSetup';
import { isNotForStorage } from '@shared/locationPolicy';
import { displayLocationId } from '@shared/location';
import { useAuth } from '../../context/authContext';
import {
  carveOut,
  fetchCellLocations,
  restoreCarveOut,
  setContraction,
} from '../../lib/locationSetupApi';
import { describeCell, locationSetupErrorText, reasonLabel } from '../../lib/locationSetupFormat';
import { ErrorBanner } from '../ui/ErrorBanner';
import { CarveOutDialog } from './CarveOutDialog';

interface CellLocationsProps {
  aisle: number;
  cell: ZoneCellKey;
  /** `setup` offers Not For Storage actions; `contraction` offers per-location contraction. */
  mode: 'setup' | 'contraction';
  /** Whether the user may remove a carve-out (OM-level). */
  canRestore: boolean;
  /** Bumped by the parent whenever the aisle changed, so the list reloads. */
  revision: number;
  onChanged: (view: AisleView) => void;
}

const smallButton =
  'h-7 rounded border border-[var(--border-strong)] px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-5)] disabled:cursor-not-allowed disabled:opacity-40';

/**
 * The individual locations inside one zone cell (#143) — the place for single-location
 * actions: marking one Not For Storage or restoring it (Zone Setup tab), or contracting /
 * opening one location (Contraction tab).
 */
export function CellLocations({
  aisle,
  cell,
  mode,
  canRestore,
  revision,
  onChanged,
}: CellLocationsProps) {
  const { token } = useAuth();
  const [locations, setLocations] = useState<CellLocationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [carving, setCarving] = useState<string | null>(null);
  const [carveError, setCarveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return () => {};
    let cancelled = false;
    fetchCellLocations(token, aisle, cell)
      .then((rows) => {
        if (!cancelled) setLocations(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(locationSetupErrorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, aisle, cell]);

  useEffect(() => load(), [load, revision]);

  /** Runs one write, then hands the updated aisle to the parent (which bumps `revision`). */
  async function run(action: () => Promise<AisleView>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
    } catch (err) {
      setError(locationSetupErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCarveOut(reason: NotForStorageReason, note: string) {
    if (!token || !carving) return;
    setBusy(true);
    setCarveError(null);
    try {
      onChanged(await carveOut(token, carving, reason, note));
      setCarving(null);
    } catch (err) {
      setCarveError(locationSetupErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Locations in cell"
      className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-4"
    >
      <h2 className="text-sm font-semibold">{describeCell(cell)}</h2>
      {error && <ErrorBanner message={error} />}
      {!locations && !error && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}

      {locations && (
        <ul className="m-0 flex max-h-80 list-none flex-col overflow-y-auto p-0">
          {locations.map((loc) => {
            const carved = isNotForStorage(loc.storageCode);
            const empty = loc.status === 'EMPTY' && loc.pallets === 0;
            return (
              <li
                key={loc.location}
                className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] py-1.5 first:border-t-0"
              >
                <div className="min-w-0">
                  <span className="font-data text-sm">{displayLocationId(loc.location)}</span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {loc.status}
                    {loc.pallets > 0
                      ? ` · ${loc.pallets} pallet${loc.pallets === 1 ? '' : 's'}`
                      : ''}
                    {loc.contraction ? ' · contracted' : ''}
                  </span>
                  {carved && (
                    <span className="block text-xs text-[var(--warning)]">
                      Not For Storage — {reasonLabel(loc.notForStorageReason)}
                      {loc.notForStorageNote ? `: ${loc.notForStorageNote}` : ''}
                    </span>
                  )}
                </div>

                {mode === 'setup' &&
                  (carved ? (
                    <button
                      type="button"
                      disabled={busy || !canRestore}
                      title={
                        canRestore
                          ? undefined
                          : 'Only an OM or ICQA can restore a Not For Storage location'
                      }
                      onClick={() => token && void run(() => restoreCarveOut(token, loc.location))}
                      className={smallButton}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !empty}
                      title={
                        empty ? undefined : 'Only an empty location can be marked Not For Storage'
                      }
                      onClick={() => {
                        setCarveError(null);
                        setCarving(loc.location);
                      }}
                      className={smallButton}
                    >
                      Not For Storage…
                    </button>
                  ))}

                {mode === 'contraction' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      token &&
                      void run(() =>
                        setContraction(token, aisle, {
                          locations: [loc.location],
                          contracted: !loc.contraction,
                        })
                      )
                    }
                    className={smallButton}
                  >
                    {loc.contraction ? 'Open' : 'Contract'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {carving && (
        <CarveOutDialog
          location={carving}
          busy={busy}
          error={carveError}
          onSubmit={(reason, note) => void submitCarveOut(reason, note)}
          onCancel={() => setCarving(null)}
        />
      )}
    </section>
  );
}
