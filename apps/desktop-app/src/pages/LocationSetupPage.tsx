import { useEffect, useMemo, useState } from 'react';
import type { AisleSummary, AisleView, ZoneCellKey } from '@shared/aisleSetup';
import { cellKey, isBinSide } from '@shared/aisleSetup';
import { hasOmOrIcqaAuthority } from '@shared/roles';
import type { Role } from '@shared/roles';
import { CarveOutList } from '../components/locationSetup/CarveOutList';
import { CellLocations } from '../components/locationSetup/CellLocations';
import { ContractionPanel } from '../components/locationSetup/ContractionPanel';
import { CreateAisleForm } from '../components/locationSetup/CreateAisleForm';
import { ZoneGrid } from '../components/locationSetup/ZoneGrid';
import { ZoneSettingsPanel } from '../components/locationSetup/ZoneSettingsPanel';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useAuth } from '../context/authContext';
import { buildGridShape } from '../lib/locationSetupGrid';
import { deleteAisle, fetchAisles } from '../lib/locationSetupApi';
import { DIRECTION_LABELS, errorData, locationSetupErrorText } from '../lib/locationSetupFormat';
import { useAisleView } from '../lib/useAisleView';
import { useCodeLookups } from '../lib/useCodeLookups';
import { useGridSelection } from '../lib/useGridSelection';

type Tab = 'setup' | 'contraction';

/** @returns the key's parts, or null if it is not a well-formed cell key */
function parseCellKey(key: string): ZoneCellKey | null {
  const [zone, side, level] = key.split('|');
  return isBinSide(side) ? { zone: Number(zone), side, level: Number(level) } : null;
}

const tabClass = (active: boolean) =>
  [
    'h-9 border-b-2 px-4 text-sm font-medium transition-colors',
    active
      ? 'border-[var(--red-primary)] text-[var(--text-primary)]'
      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
  ].join(' ');

/**
 * Location Setup Edit (#143). Pick an aisle, then:
 *   - Zone Setup — select zone cells on the grid and set their storage code / size;
 *     select a single cell to mark one of its locations Not For Storage (or restore it).
 *   - Contraction — floor / top presets or any selection, then Contract or Open; single
 *     locations from the cell list.
 * OM-level users (MANAGER/ADMIN, or ICQA) also get New Aisle and Delete Aisle, and can
 * restore Not For Storage locations.
 */
export function LocationSetupPage() {
  const { token, user } = useAuth();
  const omLevel = user ? hasOmOrIcqaAuthority(user.role as Role, user.departmentId) : false;
  const lookups = useCodeLookups();

  const [aisles, setAisles] = useState<AisleSummary[]>([]);
  const [aisleListError, setAisleListError] = useState<string | null>(null);
  const [selectedAisle, setSelectedAisle] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>('setup');
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { state, replace } = useAisleView(selectedAisle);
  const view = state.status === 'ready' ? state.view : null;

  /** Loads the aisle picker's list. */
  function loadAisles() {
    if (!token) return;
    fetchAisles(token)
      .then((list) => {
        setAisles(list);
        setAisleListError(null);
      })
      .catch((err: unknown) => setAisleListError(locationSetupErrorText(err)));
  }
  useEffect(loadAisles, [token]);

  const shape = useMemo(
    () => (view ? buildGridShape(view.cells, view.sides) : buildGridShape([], 'BOTH')),
    [view]
  );
  const cells = useMemo(() => new Map((view?.cells ?? []).map((c) => [cellKey(c), c])), [view]);
  const zoneCaptions = useMemo(
    () => new Map((view?.zones ?? []).map((z) => [z.zone, `Bins ${z.startBin}–${z.endBin}`])),
    [view]
  );
  const selection = useGridSelection(shape);
  const selectedKeys = [...selection.selected]
    .map(parseCellKey)
    .filter((k): k is ZoneCellKey => k !== null);
  const singleCell = selectedKeys.length === 1 ? selectedKeys[0] : null;

  /** Every write returns the updated aisle; show it and refresh anything derived from it. */
  function applied(next: AisleView) {
    replace(next);
    setRevision((n) => n + 1);
  }

  async function confirmDelete() {
    if (!token || !view) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAisle(token, view.aisle);
      setDeleting(false);
      setSelectedAisle(null);
      loadAisles();
    } catch (err) {
      const data = errorData(err);
      const examples = Array.isArray(data.locations)
        ? ` (${data.locations.join(', ')}${(data.blocking as number) > data.locations.length ? ', …' : ''})`
        : '';
      setDeleteError(
        `${locationSetupErrorText(err)}${typeof data.blocking === 'number' ? ` ${data.blocking} are not${examples}.` : ''}`
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Location Setup</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Locations are set up by zone: every location on a level of a zone-side shares its
            storage code and size.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {!creating && (
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Aisle
              <select
                aria-label="Aisle"
                value={selectedAisle ?? ''}
                onChange={(e) => setSelectedAisle(e.target.value ? Number(e.target.value) : null)}
                className="h-9 w-32 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)]"
              >
                <option value="">Choose…</option>
                {aisles.map((a) => (
                  <option key={a.aisle} value={a.aisle}>
                    {a.aisle}
                  </option>
                ))}
              </select>
            </label>
          )}
          {omLevel && !creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="h-9 rounded-md border border-[var(--border-strong)] px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-5)]"
            >
              New aisle
            </button>
          )}
          {omLevel && !creating && view && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleting(true);
              }}
              className="h-9 rounded-md border border-[var(--error-border)] px-3 text-sm font-medium text-[var(--error)] hover:bg-[var(--error-bg)]"
            >
              Delete aisle
            </button>
          )}
        </div>
      </div>

      {aisleListError && <ErrorBanner message={aisleListError} />}
      {lookups.failed && <ErrorBanner message="Storage codes and sizes could not be loaded." />}

      {creating ? (
        <CreateAisleForm
          storageCodes={lookups.storageCodes}
          sizes={lookups.sizes}
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            loadAisles();
            setSelectedAisle(created.aisle);
            applied(created);
          }}
        />
      ) : (
        <>
          {state.status === 'none' && (
            <p className="text-sm text-[var(--text-muted)]">Choose an aisle to edit.</p>
          )}
          {state.status === 'loading' && (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {state.status === 'error' && (
            <ErrorBanner message={locationSetupErrorText(new Error(state.errorCode))} />
          )}

          {view && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Aisle {view.aisle} · bins {view.firstBin}–{view.lastBin} ·{' '}
                {view.sides === 'BOTH' ? 'both sides' : `${view.sides.toLowerCase()} side only`} ·{' '}
                {DIRECTION_LABELS[view.zoneDirection]}
              </p>

              <div
                role="tablist"
                aria-label="Location Setup functions"
                className="flex border-b border-[var(--border-default)]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'setup'}
                  onClick={() => setTab('setup')}
                  className={tabClass(tab === 'setup')}
                >
                  Zone Setup
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'contraction'}
                  onClick={() => setTab('contraction')}
                  className={tabClass(tab === 'contraction')}
                >
                  Contraction
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_20rem] gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                  <ZoneGrid
                    shape={shape}
                    cells={cells}
                    mode={tab}
                    selection={selection}
                    zoneCaptions={zoneCaptions}
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    Click a cell, drag across cells, Shift-click for a range, Ctrl/Cmd-click to add
                    or remove one. Click a level or side heading to select it all.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {tab === 'setup' ? (
                    <ZoneSettingsPanel
                      aisle={view.aisle}
                      selected={selectedKeys}
                      storageCodes={lookups.storageCodes}
                      sizes={lookups.sizes}
                      onApplied={applied}
                    />
                  ) : (
                    <ContractionPanel
                      view={view}
                      selected={selectedKeys}
                      onSelect={(keys) => selection.selectCells(keys)}
                      onApplied={applied}
                    />
                  )}
                  {singleCell && (
                    <CellLocations
                      aisle={view.aisle}
                      cell={singleCell}
                      mode={tab}
                      canRestore={omLevel}
                      revision={revision}
                      onChanged={applied}
                    />
                  )}
                  {tab === 'setup' && (
                    <CarveOutList view={view} canRestore={omLevel} onChanged={applied} />
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {deleting && view && (
        <ConfirmDialog
          title={`Delete aisle ${view.aisle}?`}
          confirmLabel="Delete aisle"
          danger
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(false)}
        >
          <p>
            Every location in the aisle must be empty. The aisle and its locations are hidden from
            every function; their history is kept.
          </p>
          {deleteError && (
            <p role="alert" className="mt-2 text-[var(--error)]">
              {deleteError}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
