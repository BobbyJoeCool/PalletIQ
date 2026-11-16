import type { KeyboardEvent, MouseEvent } from 'react';
import type { ZoneCellView, ZoneSetting } from '@shared/aisleSetup';
import { cellKey } from '@shared/aisleSetup';
import { SIDE_LABELS } from '../../lib/locationSetupFormat';
import type { ClickModifiers, GridShape } from '../../lib/useGridSelection';

/** Which facts a cell shows besides its storage code and size. */
export type ZoneGridMode = 'setup' | 'contraction' | 'preview';

/** Selection wiring from useGridSelection; omitted for a read-only grid. */
export interface ZoneGridSelection {
  selected: Set<string>;
  pressCell: (col: number, row: number, mods: ClickModifiers, startsDrag: boolean) => void;
  enterCell: (col: number, row: number) => void;
  selectRow: (row: number, add: boolean) => void;
  selectColumn: (col: number, add: boolean) => void;
  selectAll: () => void;
}

interface ZoneGridProps {
  shape: GridShape;
  /** Cell contents by cellKey. Counts are present for a saved aisle, absent in a preview. */
  cells: Map<string, ZoneSetting | ZoneCellView>;
  mode: ZoneGridMode;
  selection?: ZoneGridSelection;
  /** Zone header lines, e.g. "Bins 97–128", by zone number. */
  zoneCaptions?: Map<number, string>;
}

/** @returns the counts a saved cell carries, or null for a preview cell */
function counts(cell: ZoneSetting | ZoneCellView): ZoneCellView | null {
  return 'locations' in cell ? cell : null;
}

/** @returns the click's modifier keys, treating Cmd like Ctrl on macOS */
function modifiers(event: MouseEvent | KeyboardEvent): ClickModifiers {
  return { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey };
}

/**
 * The aisle as Location Setup edits it (#143): rows are levels (top level at the top),
 * columns are zone-sides, and each cell is one zone setting — every location on that
 * level of that zone-side. The same grid serves the zone setup editor, the Contraction
 * tab (cells tinted by how much of them is contracted) and the New Aisle preview.
 *
 * Selection follows spreadsheet rules (see useGridSelection): click, Ctrl/Cmd-click,
 * Shift-click or drag; row and column headers select a level or a zone-side; the corner
 * selects everything. Cells are buttons, so the keyboard works too (Enter / Space).
 */
export function ZoneGrid({ shape, cells, mode, selection, zoneCaptions }: ZoneGridProps) {
  const zones = [...new Set(shape.columns.map((c) => c.zone))];
  const sidesPerZone = shape.columns.length / Math.max(zones.length, 1);

  const headerButton =
    'w-full rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] enabled:hover:bg-[var(--surface-5)] disabled:cursor-default';

  return (
    <div className="overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] select-none">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 w-14 bg-[var(--surface-2)] p-1">
              <button
                type="button"
                disabled={!selection}
                onClick={() => selection?.selectAll()}
                className={headerButton}
                title="Select every cell"
              >
                All
              </button>
            </th>
            {zones.map((zone) => (
              <th
                key={zone}
                colSpan={sidesPerZone}
                className="border-l-2 border-[var(--border-strong)] px-1 pt-1.5 text-sm font-semibold text-[var(--text-primary)]"
              >
                Zone {zone}
                {zoneCaptions?.get(zone) && (
                  <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                    {zoneCaptions.get(zone)}
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr>
            {shape.columns.map((column, col) => (
              <th
                key={`${column.zone}-${column.side}`}
                className={[
                  'p-1',
                  col % sidesPerZone === 0 ? 'border-l-2 border-[var(--border-strong)]' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  disabled={!selection}
                  onClick={(event) => selection?.selectColumn(col, modifiers(event).toggle)}
                  aria-label={`Select Zone ${column.zone} ${SIDE_LABELS[column.side]}`}
                  className={headerButton}
                >
                  {SIDE_LABELS[column.side]}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shape.levels.map((level, row) => (
            <tr key={level}>
              <th className="sticky left-0 z-10 bg-[var(--surface-2)] p-1">
                <button
                  type="button"
                  disabled={!selection}
                  onClick={(event) => selection?.selectRow(row, modifiers(event).toggle)}
                  aria-label={`Select level ${level}`}
                  className={headerButton}
                >
                  L{level}
                </button>
              </th>
              {shape.columns.map((column, col) => {
                const key = cellKey({ zone: column.zone, side: column.side, level });
                const cell = cells.get(key);
                const edge =
                  col % sidesPerZone === 0 ? 'border-l-2 border-l-[var(--border-strong)]' : '';
                if (!cell) return <td key={key} className={`${edge} p-0.5`} aria-hidden="true" />;

                const c = counts(cell);
                const isSelected = selection?.selected.has(key) ?? false;
                const contractedAll = c != null && c.locations > 0 && c.contracted === c.locations;
                const contractedSome = c != null && c.contracted > 0 && !contractedAll;
                const tint =
                  mode === 'contraction' && contractedAll
                    ? 'bg-[#4A0000]'
                    : mode === 'contraction' && contractedSome
                      ? 'bg-[#2A0A0A]'
                      : 'bg-[var(--surface-4)]';

                return (
                  <td key={key} className={`${edge} p-0.5`}>
                    <button
                      type="button"
                      disabled={!selection}
                      aria-pressed={selection ? isSelected : undefined}
                      aria-label={`Zone ${column.zone} ${SIDE_LABELS[column.side]} level ${level}: ${cell.storageCode} ${cell.size}`}
                      onMouseDown={(event) => {
                        if (event.button !== 0 || !selection) return;
                        event.preventDefault();
                        selection.pressCell(col, row, modifiers(event), true);
                      }}
                      onMouseEnter={() => selection?.enterCell(col, row)}
                      onKeyDown={(event) => {
                        if (!selection || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        selection.pressCell(col, row, modifiers(event), false);
                      }}
                      className={[
                        'flex h-11 w-full min-w-16 flex-col items-center justify-center rounded border font-data leading-tight',
                        tint,
                        isSelected
                          ? 'border-[var(--info)] outline outline-1 outline-[var(--info)]'
                          : 'border-[var(--border-subtle)]',
                        selection
                          ? 'cursor-pointer hover:border-[var(--border-strong)]'
                          : 'cursor-default',
                      ].join(' ')}
                    >
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {cell.storageCode} · {cell.size}
                      </span>
                      {c && mode === 'setup' && c.notForStorage > 0 && (
                        <span className="text-[10px] text-[var(--warning)]">
                          {c.notForStorage} XO
                        </span>
                      )}
                      {c && mode === 'contraction' && c.contracted > 0 && (
                        <span className="text-[10px] text-[var(--error)]">
                          {contractedAll ? 'Contracted' : `${c.contracted}/${c.locations}`}
                        </span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
