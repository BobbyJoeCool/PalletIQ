import { useMemo } from 'react';
import { CellValue } from './CellValue';
import { SIZES } from '../../lib/sizes';

export interface AisleSizeCount { size: string; empty: number; staged: number }

export interface AisleSizeRow { aisle: number; totalEmpty: number; sizes: AisleSizeCount[] }

/** Sort key is either 'aisle' or one of the size codes shown as a results column. */
export interface AisleSizeSort { column: string; direction: 'asc' | 'desc' }

/**
 * Sorts aisle rows by the active column. Ascending sort on a size column pushes any aisle
 * with a zero count for that size to the bottom instead of surfacing it first (a 0 there
 * isn't a useful "smallest" result) — descending naturally already puts zeros last, so
 * only ascending needs the special case. Aisle-column sorts are always plain numeric.
 * Ties keep whatever relative order the rows were already in (stable sort).
 */
function sortAisleRows(list: AisleSizeRow[], sort: AisleSizeSort): AisleSizeRow[] {
  const getValue = (r: AisleSizeRow) => (sort.column === 'aisle' ? r.aisle : (r.sizes.find((s) => s.size === sort.column)?.empty ?? 0));
  if (sort.column !== 'aisle' && sort.direction === 'asc') {
    const nonZero = list.filter((r) => getValue(r) > 0).sort((a, b) => getValue(a) - getValue(b));
    const zero = list.filter((r) => getValue(r) === 0);
    return [...nonZero, ...zero];
  }
  const dir = sort.direction === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => (getValue(a) - getValue(b)) * dir);
}

/**
 * Shared "empty locations by aisle" results table — originally ELA's own results section
 * (Feature/issue #80's sortable-columns expansion, v1.6.4), extracted so STG's bottom info
 * panel can show the literal same table (not a re-derived lookalike) when only a Storage
 * Code (optionally + Size) is entered and no Aisle yet. A header column per Size actually
 * present in the returned rows (canonical XS→L order), tap any header to sort by it
 * (ascending/descending, flips on a repeat tap of the same column), tap a row to select its
 * Aisle — the caller decides what "select" means (ELA toggles a `selected` highlight and
 * enables separate nav buttons; STG commits the Aisle straight to Master Control).
 */
export function AisleSizeTable({
  rows, sort, onSortChange, selected, onSelectAisle,
}: {
  rows: AisleSizeRow[];
  sort: AisleSizeSort;
  onSortChange: (column: string) => void;
  selected?: number | null;
  onSelectAisle: (aisle: number) => void;
}) {
  // Size columns are the union of every size actually present across all returned aisles
  // (each aisle reports its full size breakdown, not just the queried size), in canonical
  // SIZES order rather than API/Set insertion order.
  const sizeCols = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.sizes.forEach((s) => set.add(s.size)));
    return SIZES.filter((s) => set.has(s));
  }, [rows]);

  const sortedRows = useMemo(() => sortAisleRows(rows, sort), [rows, sort]);

  // No outer border/rounding here — this fills whatever bordered container the caller
  // already provides (ELA's results panel, STG's bottom info panel), so it isn't
  // double-bordered when nested inside one.
  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      <div className="flex bg-[#111111] border-b border-[#2A2A2A] shrink-0">
        <button type="button" onClick={() => onSortChange('aisle')} className="w-[140px] px-4 py-3 text-left">
          <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
            Aisle{sort.column === 'aisle' && (sort.direction === 'asc' ? ' ▲' : ' ▼')}
          </span>
        </button>
        {/* Subtle divider between size columns (issue #63) — border-l on every column
            after the first also separates the size columns from the Aisle column. */}
        {sizeCols.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onSortChange(s)}
            className={`flex-1 px-4 py-3 text-center ${i > 0 ? 'border-l border-[#1F1F1F]' : ''}`}
          >
            <span className="font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
              {s}{sort.column === s && (sort.direction === 'asc' ? ' ▲' : ' ▼')}
            </span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {sortedRows.map((row) => (
          <button
            key={row.aisle}
            type="button"
            onClick={() => onSelectAisle(row.aisle)}
            className={`flex w-full border-b border-[#1A1A1A] transition-colors ${
              selected === row.aisle ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'
            }`}
          >
            <div className="w-[140px] px-4 py-3 text-left">
              <span className="font-data text-[20px] font-semibold text-white">{row.aisle}</span>
            </div>
            {sizeCols.map((s, i) => {
              const cell = row.sizes.find((sz) => sz.size === s);
              return (
                <div key={s} className={`flex-1 px-4 py-3 text-center ${i > 0 ? 'border-l border-[#1F1F1F]' : ''}`}>
                  {cell && <CellValue empty={cell.empty} staged={cell.staged} large />}
                </div>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
