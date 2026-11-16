import { useState } from 'react';
import type { AisleView, ZoneCellKey } from '@shared/aisleSetup';
import { useAuth } from '../../context/authContext';
import { applyZoneSettings } from '../../lib/locationSetupApi';
import type { CodeOption } from '../../lib/locationSetupApi';
import { errorData, locationSetupErrorText } from '../../lib/locationSetupFormat';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorBanner } from '../ui/ErrorBanner';

interface ZoneSettingsPanelProps {
  aisle: number;
  selected: ZoneCellKey[];
  storageCodes: CodeOption[];
  sizes: CodeOption[];
  onApplied: (view: AisleView) => void;
}

/** Sentinel for "leave this attribute alone" in both pickers. */
const NO_CHANGE = '';

const selectClass =
  'h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]';

/**
 * Sets the storage code and/or size of the selected zone cells (#143). Both pickers start
 * at NO CHANGE and only the ones changed are applied. If any selected location holds
 * freight, the server asks for confirmation (stored pallets keep their own values) and
 * this panel shows which locations before re-sending with the confirmation.
 */
export function ZoneSettingsPanel({
  aisle,
  selected,
  storageCodes,
  sizes,
  onApplied,
}: ZoneSettingsPanelProps) {
  const { token } = useAuth();
  const [storageCode, setStorageCode] = useState(NO_CHANGE);
  const [size, setSize] = useState(NO_CHANGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [occupied, setOccupied] = useState<{ count: number; locations: string[] } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const nothingChosen = storageCode === NO_CHANGE && size === NO_CHANGE;

  /** Sends the change; `confirmOccupied` acknowledges stored freight. */
  async function apply(confirmOccupied: boolean) {
    if (!token) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const view = await applyZoneSettings(token, aisle, {
        cells: selected,
        ...(storageCode !== NO_CHANGE && { storageCode }),
        ...(size !== NO_CHANGE && { size }),
        confirmOccupied,
      });
      setOccupied(null);
      setStorageCode(NO_CHANGE);
      setSize(NO_CHANGE);
      setDone(`Updated ${selected.length} zone ${selected.length === 1 ? 'cell' : 'cells'}.`);
      onApplied(view);
    } catch (err) {
      if (err instanceof Error && err.message === 'OCCUPIED_CONFIRM_REQUIRED') {
        const data = errorData(err);
        setOccupied({
          count: typeof data.occupied === 'number' ? data.occupied : 0,
          locations: Array.isArray(data.locations)
            ? data.locations.filter((l): l is string => typeof l === 'string')
            : [],
        });
      } else {
        setError(locationSetupErrorText(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Zone settings"
      className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-4"
    >
      <h2 className="text-sm font-semibold">
        {selected.length === 0
          ? 'Select zone cells to change'
          : `${selected.length} zone ${selected.length === 1 ? 'cell' : 'cells'} selected`}
      </h2>

      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Storage code
        <select
          value={storageCode}
          onChange={(e) => setStorageCode(e.target.value)}
          disabled={selected.length === 0}
          className={selectClass}
        >
          <option value={NO_CHANGE}>NO CHANGE</option>
          {storageCodes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.desc}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Size
        <select
          value={size}
          onChange={(e) => setSize(e.target.value)}
          disabled={selected.length === 0}
          className={selectClass}
        >
          <option value={NO_CHANGE}>NO CHANGE</option>
          {sizes.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} — {s.desc}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => void apply(false)}
        disabled={busy || selected.length === 0 || nothingChosen}
        className="h-9 rounded-md bg-[var(--red-primary)] text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        Apply
      </button>

      {error && <ErrorBanner message={error} />}
      {done && (
        <p className="text-sm text-[var(--success)]" role="status">
          {done}
        </p>
      )}

      {occupied && (
        <ConfirmDialog
          title="Locations hold freight"
          confirmLabel="Apply anyway"
          busy={busy}
          onConfirm={() => void apply(true)}
          onCancel={() => setOccupied(null)}
        >
          <p>
            {occupied.count} of the selected locations hold freight or are reserved. Pallets already
            there keep their current storage code and size.
          </p>
          {occupied.locations.length > 0 && (
            <p className="mt-2 font-data text-xs text-[var(--text-muted)]">
              {occupied.locations.join(', ')}
              {occupied.count > occupied.locations.length ? ', …' : ''}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
