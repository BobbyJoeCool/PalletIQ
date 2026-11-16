import { useMemo, useState } from 'react';
import type {
  AisleDefinition,
  AisleSides,
  AisleView,
  BinSide,
  LevelSetting,
  ZoneDirection,
  ZoneRange,
} from '@shared/aisleSetup';
import {
  AISLE_SIDES,
  ZONE_DIRECTIONS,
  ZONE_NUMBERS,
  binsOf,
  cellKey,
  defaultZoneRanges,
  expandLocations,
  sidesOf,
  validateDefinition,
  zoneSettingsOf,
} from '@shared/aisleSetup';
import { useAuth } from '../../context/authContext';
import { buildGridShape } from '../../lib/locationSetupGrid';
import { createAisle } from '../../lib/locationSetupApi';
import type { CodeOption } from '../../lib/locationSetupApi';
import {
  DIRECTION_LABELS,
  LOCATION_SETUP_ERRORS,
  SIDE_LABELS,
  locationSetupErrorText,
} from '../../lib/locationSetupFormat';
import { ErrorBanner } from '../ui/ErrorBanner';
import { LevelListEditor } from './LevelListEditor';
import { ZoneGrid } from './ZoneGrid';

interface CreateAisleFormProps {
  storageCodes: CodeOption[];
  sizes: CodeOption[];
  onCreated: (view: AisleView) => void;
  onCancel: () => void;
}

const SIDES_LABELS: Record<AisleSides, string> = {
  BOTH: 'Both sides',
  ODD: 'Odd side only',
  EVEN: 'Even side only',
};

const inputClass =
  'h-9 w-24 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]';
const labelClass =
  'flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]';

/** @returns the text as a whole number, or NaN */
function toInt(text: string): number {
  return /^\d+$/.test(text.trim()) ? parseInt(text.trim(), 10) : NaN;
}

/**
 * New Aisle (#143, OM-level): aisle number, sides, first and last bin, zone direction,
 * the four zone ranges (an even split by default, editable), each side's levels, and
 * per-zone level overrides for the unusual zones (e.g. aisle 730's 13-level Extra Small
 * zone). A preview grid and location count update as it is filled in; the same shared
 * validation the server runs decides whether Create is enabled.
 */
export function CreateAisleForm({
  storageCodes,
  sizes,
  onCreated,
  onCancel,
}: CreateAisleFormProps) {
  const { token } = useAuth();
  const firstCode = storageCodes[0]?.code ?? '';
  const firstSize = sizes.find((s) => s.code === 'M')?.code ?? sizes[0]?.code ?? '';
  const startingLevels: LevelSetting[] = [{ level: 1, storageCode: firstCode, size: firstSize }];

  const [aisleText, setAisleText] = useState('');
  const [sides, setSides] = useState<AisleSides>('BOTH');
  const [firstBinText, setFirstBinText] = useState('1');
  const [lastBinText, setLastBinText] = useState('128');
  const [direction, setDirection] = useState<ZoneDirection>('BACK_TO_FRONT');
  /** Hand-edited zone ranges; null means "use the even split". */
  const [customZones, setCustomZones] = useState<ZoneRange[] | null>(null);
  const [sideLevels, setSideLevels] = useState<Record<BinSide, LevelSetting[]>>({
    ODD: startingLevels,
    EVEN: startingLevels,
  });
  const [overrides, setOverrides] = useState<Record<string, LevelSetting[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstBin = toInt(firstBinText);
  const lastBin = toInt(lastBinText);
  const binsKnown = !Number.isNaN(firstBin) && !Number.isNaN(lastBin) && firstBin <= lastBin;
  const evenSplit = useMemo(
    () => (binsKnown ? defaultZoneRanges(sides, firstBin, lastBin, direction) : []),
    [binsKnown, sides, firstBin, lastBin, direction]
  );
  const zones = customZones ?? evenSplit;
  const activeSides = sidesOf(sides);

  const definition: AisleDefinition = {
    aisle: toInt(aisleText),
    sides,
    firstBin,
    lastBin,
    zoneDirection: direction,
    zones,
    sideLevels: Object.fromEntries(activeSides.map((s) => [s, sideLevels[s]])),
    zoneOverrides: Object.entries(overrides)
      .map(([key, levels]) => {
        const [zone, side] = key.split('|');
        return { zone: Number(zone), side: side as BinSide, levels };
      })
      .filter((o) => activeSides.includes(o.side)),
  };

  const lookups = {
    storageCodes: storageCodes.map((c) => c.code),
    sizes: sizes.map((s) => s.code),
  };
  const validation = validateDefinition(definition, lookups);
  const settings = validation ? [] : zoneSettingsOf(definition);
  const locationCount = validation ? 0 : expandLocations(definition).length;
  const shape = buildGridShape(settings, sides);
  const previewCells = new Map(settings.map((s) => [cellKey(s), s]));
  const zoneCaptions = new Map(zones.map((z) => [z.zone, `Bins ${z.startBin}–${z.endBin}`]));

  /** Changing what the even split depends on throws away hand-edited ranges. */
  function resetZones() {
    setCustomZones(null);
  }

  function editZone(zone: number, field: 'startBin' | 'endBin', text: string) {
    const value = toInt(text);
    setCustomZones(
      (zones.length ? zones : evenSplit).map((z) =>
        z.zone === zone ? { ...z, [field]: value } : z
      )
    );
  }

  function toggleOverride(zone: number, side: BinSide) {
    const key = `${zone}|${side}`;
    setOverrides((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = sideLevels[side];
      return next;
    });
  }

  async function submit() {
    if (!token || validation) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await createAisle(token, definition));
    } catch (err) {
      setError(locationSetupErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className={labelClass}>
          Aisle
          <input
            aria-label="Aisle number"
            value={aisleText}
            onChange={(e) => setAisleText(e.target.value)}
            inputMode="numeric"
            maxLength={3}
            placeholder="401"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Sides
          <select
            aria-label="Sides"
            value={sides}
            onChange={(e) => {
              setSides(e.target.value as AisleSides);
              resetZones();
            }}
            className={`${inputClass} w-40 font-ui`}
          >
            {AISLE_SIDES.map((s) => (
              <option key={s} value={s}>
                {SIDES_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          First bin
          <input
            aria-label="First bin"
            value={firstBinText}
            onChange={(e) => {
              setFirstBinText(e.target.value);
              resetZones();
            }}
            inputMode="numeric"
            maxLength={3}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Last bin
          <input
            aria-label="Last bin"
            value={lastBinText}
            onChange={(e) => {
              setLastBinText(e.target.value);
              resetZones();
            }}
            inputMode="numeric"
            maxLength={3}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Zone direction
          <select
            aria-label="Zone direction"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as ZoneDirection);
              resetZones();
            }}
            className={`${inputClass} w-72 font-ui`}
          >
            {ZONE_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {DIRECTION_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section aria-label="Zones" className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Zones</h2>
          {customZones && (
            <button
              type="button"
              onClick={resetZones}
              className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)]"
            >
              Reset to even split
            </button>
          )}
        </div>
        {zones.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Enter a bin range with at least four {sides === 'BOTH' ? 'bin pairs' : 'bins'}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {ZONE_NUMBERS.map((zone) => {
              const z = zones.find((r) => r.zone === zone);
              return (
                <div key={zone} className="flex items-center gap-1.5 text-sm">
                  <span className="w-14 font-semibold">Zone {zone}</span>
                  <input
                    aria-label={`Zone ${zone} first bin`}
                    value={Number.isNaN(z?.startBin) ? '' : String(z?.startBin ?? '')}
                    onChange={(e) => editZone(zone, 'startBin', e.target.value)}
                    inputMode="numeric"
                    className={`${inputClass} w-16`}
                  />
                  –
                  <input
                    aria-label={`Zone ${zone} last bin`}
                    value={Number.isNaN(z?.endBin) ? '' : String(z?.endBin ?? '')}
                    onChange={(e) => editZone(zone, 'endBin', e.target.value)}
                    inputMode="numeric"
                    className={`${inputClass} w-16`}
                  />
                  {z && !Number.isNaN(z.startBin) && !Number.isNaN(z.endBin) && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {binsOf(sides, z.startBin, z.endBin).length} bins
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="Levels" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Levels</h2>
        <div className="flex flex-wrap gap-8">
          {activeSides.map((side) => (
            <div key={side} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {SIDE_LABELS[side]} side
              </h3>
              <LevelListEditor
                label={`${SIDE_LABELS[side]} side`}
                levels={sideLevels[side]}
                storageCodes={storageCodes}
                sizes={sizes}
                onChange={(levels) => setSideLevels((current) => ({ ...current, [side]: levels }))}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Zone overrides
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            For a zone whose levels differ from its side.
          </p>
          <div className="flex flex-wrap gap-3">
            {ZONE_NUMBERS.flatMap((zone) =>
              activeSides.map((side) => {
                const key = `${zone}|${side}`;
                return (
                  <label key={key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(overrides[key])}
                      onChange={() => toggleOverride(zone, side)}
                    />
                    Zone {zone} {SIDE_LABELS[side]}
                  </label>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap gap-8">
            {Object.entries(overrides)
              .filter(([key]) => activeSides.includes(key.split('|')[1] as BinSide))
              .map(([key, levels]) => {
                const [zone, side] = key.split('|');
                const label = `Zone ${zone} ${SIDE_LABELS[side as BinSide]}`;
                return (
                  <div key={key} className="flex flex-col gap-2">
                    <h4 className="text-xs font-semibold">{label}</h4>
                    <LevelListEditor
                      label={label}
                      levels={levels}
                      storageCodes={storageCodes}
                      sizes={sizes}
                      onChange={(next) => setOverrides((current) => ({ ...current, [key]: next }))}
                    />
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <section aria-label="Preview" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          Preview{locationCount > 0 ? ` — ${locationCount} locations` : ''}
        </h2>
        {validation ? (
          <p className="text-sm text-[var(--warning)]">
            {LOCATION_SETUP_ERRORS[validation] ?? validation}
          </p>
        ) : (
          <ZoneGrid shape={shape} cells={previewCells} mode="preview" zoneCaptions={zoneCaptions} />
        )}
      </section>

      {error && <ErrorBanner message={error} />}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || validation !== null}
          className="h-10 rounded-md bg-[var(--red-primary)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create aisle'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-md border border-[var(--border-strong)] px-5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-5)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
