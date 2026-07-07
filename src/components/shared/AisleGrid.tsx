export type GridSide = 'odd' | 'even';

export interface GridCell {
  zone: number;
  side: GridSide;
  storageCode: string;
  size: string;
  contraction: boolean;
}

export interface GridLevel {
  level: number;
  cells: GridCell[];
}

interface AisleGridProps {
  levels: GridLevel[];
  /** Shrinks row height and header padding for panes shorter than ELZ's full-page one
   *  (e.g. STG's bottom-half zone map). Default false keeps ELZ pixel-identical. */
  dense?: boolean;
}

const ZONES = [1, 2, 3, 4] as const;
const SIDES: GridSide[] = ['odd', 'even'];

/** Builds the lookup key for a grid cell's zone-side position, e.g. "2-odd". */
function cellKey(zone: number, side: GridSide): string {
  return `${zone}-${side}`;
}

/**
 * Visual map of one aisle's physical layout: 8 fixed columns (Zone 1-4 × Odd/Even side)
 * by one row per physical level, Level 1 at the bottom mirroring the real aisle.
 * Each cell shows its {StorageCode}-{Size} designation; contracted zone-side/level groups
 * are highlighted red. Read-only for every role — no cell interaction (per ELZ.md).
 * Shared between ELZ (built) and STG (deferred — design session required).
 */
export function AisleGrid({ levels, dense = false }: AisleGridProps) {
  // Level 1 at bottom, highest level at top.
  const rows = [...levels].sort((a, b) => b.level - a.level);

  return (
    <div className="flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-hidden select-none">
      {/* Header row */}
      <div className="flex bg-[#111111] border-b border-[#2A2A2A]">
        <div className="w-[56px] shrink-0" />
        {ZONES.map((zone) => (
          <div key={zone} className="flex-1 flex">
            {SIDES.map((side) => (
              <div
                key={cellKey(zone, side)}
                className={`flex-1 text-center border-l border-[#2A2A2A] first:border-l-0 ${dense ? 'py-1' : 'py-2'}`}
              >
                <span className="font-ui text-[13px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
                  Z{zone} {side === 'odd' ? 'Odd' : 'Even'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Level rows */}
      <div className="flex flex-col">
        {rows.map((row) => {
          const byPos = new Map(row.cells.map((c) => [cellKey(c.zone, c.side), c]));
          return (
            <div key={row.level} className="flex border-b border-[#1A1A1A] last:border-b-0">
              <div className="w-[56px] shrink-0 flex items-center justify-center bg-[#0D0D0D] border-r border-[#2A2A2A]">
                <span className="font-data text-[14px] font-semibold text-[#9A9A9A]">
                  {row.level}
                </span>
              </div>
              {ZONES.map((zone) => (
                <div key={zone} className="flex-1 flex">
                  {SIDES.map((side) => {
                    const cell = byPos.get(cellKey(zone, side));
                    return (
                      <div
                        key={cellKey(zone, side)}
                        className={`flex-1 flex items-center justify-center border-l border-[#1A1A1A] first:border-l-0 ${dense ? 'h-[32px]' : 'h-[46px]'} ${
                          cell?.contraction ? 'bg-[#4A0000]' : 'bg-[#0A0A0A]'
                        }`}
                      >
                        {cell ? (
                          <span
                            className={`font-data text-[13px] font-medium ${
                              cell.contraction ? 'text-[#FF6666]' : 'text-[#CFCFCF]'
                            }`}
                          >
                            {cell.storageCode}-{cell.size}
                          </span>
                        ) : (
                          <span className="text-[#333] text-[13px]">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
