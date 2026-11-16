import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ZoneCellKey } from '@shared/aisleSetup';
import { cellKey } from '@shared/aisleSetup';

/** A grid column: one zone-side. */
export interface GridColumn {
  zone: number;
  side: ZoneCellKey['side'];
}

/** The grid's shape, as the selection needs it. */
export interface GridShape {
  columns: GridColumn[];
  /** Levels from the top row down. */
  levels: number[];
  /** Keys of the cells that exist (a zone-side may have fewer levels than the tallest). */
  existing: Set<string>;
}

/** Modifier keys held during a click. */
export interface ClickModifiers {
  shift: boolean;
  toggle: boolean;
}

/**
 * Spreadsheet-style selection for the Location Setup grid (#143). A click selects one
 * cell; Ctrl/Cmd-click adds or removes one; Shift-click, or dragging, selects the
 * rectangle from the anchor — computed from row and column indices, so a cell is either
 * inside the range or not. Row and column headers select a whole level or zone-side.
 * Only cells that exist are ever selected.
 *
 * @param shape - the grid's columns, levels and existing cells
 * @returns the selected keys and the handlers the grid wires to its cells and headers
 */
export function useGridSelection(shape: GridShape) {
  const [rawSelected, setSelected] = useState<Set<string>>(new Set());
  // Only cells that still exist count as selected — another aisle may have loaded, or its
  // levels changed, since they were picked.
  const selected = useMemo(
    () => new Set([...rawSelected].filter((key) => shape.existing.has(key))),
    [rawSelected, shape.existing]
  );
  const anchorRef = useRef<{ col: number; row: number } | null>(null);
  const draggingRef = useRef(false);

  // A drag ends wherever the mouse is released.
  useEffect(() => {
    const stop = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const keyAt = useCallback(
    (col: number, row: number) => {
      const column = shape.columns[col];
      return cellKey({ zone: column.zone, side: column.side, level: shape.levels[row] });
    },
    [shape]
  );

  /** Every existing cell inside the index rectangle between two corners. */
  const rectangle = useCallback(
    (a: { col: number; row: number }, b: { col: number; row: number }) => {
      const keys = new Set<string>();
      for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) {
        for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) {
          const key = keyAt(col, row);
          if (shape.existing.has(key)) keys.add(key);
        }
      }
      return keys;
    },
    [keyAt, shape.existing]
  );

  /** Mouse down or keyboard activation on a cell. */
  const pressCell = useCallback(
    (col: number, row: number, mods: ClickModifiers, startsDrag: boolean) => {
      const key = keyAt(col, row);
      if (mods.shift && anchorRef.current) {
        setSelected(rectangle(anchorRef.current, { col, row }));
        return;
      }
      anchorRef.current = { col, row };
      if (mods.toggle) {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        return;
      }
      setSelected(new Set([key]));
      draggingRef.current = startsDrag;
    },
    [keyAt, rectangle]
  );

  /** Mouse entering a cell: extends the rectangle while dragging. */
  const enterCell = useCallback(
    (col: number, row: number) => {
      if (draggingRef.current && anchorRef.current)
        setSelected(rectangle(anchorRef.current, { col, row }));
    },
    [rectangle]
  );

  /** Replaces (or, with toggle, adds to) the selection with a set of cells. */
  const selectCells = useCallback(
    (keys: Iterable<string>, add = false) => {
      const wanted = [...keys].filter((key) => shape.existing.has(key));
      setSelected((current) => (add ? new Set([...current, ...wanted]) : new Set(wanted)));
    },
    [shape.existing]
  );

  const selectRow = useCallback(
    (row: number, add: boolean) =>
      selectCells(
        shape.columns.map((_, col) => keyAt(col, row)),
        add
      ),
    [keyAt, selectCells, shape.columns]
  );

  const selectColumn = useCallback(
    (col: number, add: boolean) =>
      selectCells(
        shape.levels.map((_, row) => keyAt(col, row)),
        add
      ),
    [keyAt, selectCells, shape.levels]
  );

  const selectAll = useCallback(() => selectCells(shape.existing), [selectCells, shape.existing]);
  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, pressCell, enterCell, selectRow, selectColumn, selectAll, selectCells, clear };
}
