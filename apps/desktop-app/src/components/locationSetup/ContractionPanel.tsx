import { useState } from 'react';
import type { AisleView, ZoneCellKey } from '@shared/aisleSetup';
import { cellKey, floorPresetCells, topPresetCells } from '@shared/aisleSetup';
import { useAuth } from '../../context/authContext';
import { setContraction } from '../../lib/locationSetupApi';
import { locationSetupErrorText } from '../../lib/locationSetupFormat';
import { ErrorBanner } from '../ui/ErrorBanner';

interface ContractionPanelProps {
  view: AisleView;
  selected: ZoneCellKey[];
  /** Replaces the grid selection with a set of cell keys. */
  onSelect: (keys: string[]) => void;
  onApplied: (view: AisleView) => void;
}

const presetButton =
  'h-9 rounded-md border border-[var(--border-strong)] px-3 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-5)]';

/**
 * The Contraction tab's controls (#143). Two presets select the common cases — every
 * floor location, or the top of every zone-side (top three levels where that top is Half
 * Small or Extra Small) — and Contract / Open apply to whatever is selected, presets or a
 * hand-made selection. Contraction is allowed on occupied locations: it only stops future
 * puts.
 */
export function ContractionPanel({ view, selected, onSelect, onApplied }: ContractionPanelProps) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const contractedLocations = view.cells.reduce((sum, c) => sum + c.contracted, 0);
  const totalLocations = view.cells.reduce((sum, c) => sum + c.locations, 0);

  async function apply(contracted: boolean) {
    if (!token) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      onApplied(await setContraction(token, view.aisle, { cells: selected, contracted }));
      setDone(
        `${contracted ? 'Contracted' : 'Opened'} ${selected.length} zone ${selected.length === 1 ? 'cell' : 'cells'}.`
      );
    } catch (err) {
      setError(locationSetupErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Contraction"
      className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-4"
    >
      <div>
        <h2 className="text-sm font-semibold">Contraction</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {contractedLocations} of {totalLocations} locations contracted.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Select
        </span>
        <button
          type="button"
          onClick={() => onSelect(floorPresetCells(view.cells).map(cellKey))}
          className={presetButton}
        >
          All floor locations
        </button>
        <button
          type="button"
          onClick={() => onSelect(topPresetCells(view.cells).map(cellKey))}
          className={presetButton}
        >
          All top locations
          <span className="block text-xs font-normal text-[var(--text-muted)]">
            Top 3 levels where the top is Half Small or Extra Small
          </span>
        </button>
      </div>

      <p className="text-sm">
        {selected.length === 0
          ? 'Nothing selected.'
          : `${selected.length} zone ${selected.length === 1 ? 'cell' : 'cells'} selected.`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void apply(true)}
          disabled={busy || selected.length === 0}
          className="h-9 flex-1 rounded-md bg-[var(--red-primary)] text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Contract
        </button>
        <button
          type="button"
          onClick={() => void apply(false)}
          disabled={busy || selected.length === 0}
          className="h-9 flex-1 rounded-md border border-[var(--border-strong)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-5)] disabled:opacity-50"
        >
          Open
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      {done && (
        <p className="text-sm text-[var(--success)]" role="status">
          {done}
        </p>
      )}
    </section>
  );
}
