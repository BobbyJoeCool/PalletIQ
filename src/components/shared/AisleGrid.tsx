import { SIZE_WEIGHTS } from '../../lib/sizes';
import { STORAGE_CODE_COLOR_FALLBACK, STORAGE_CODE_COLORS } from '../../lib/storageCodeColors';

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

export interface ZoneBinRange {
  zone: number;
  minBin: number;
  maxBin: number;
}

interface AisleGridProps {
  levels: GridLevel[];
  /** Per-zone min/max bin (both sides combined) — shown as a "BINS: {max} - {min}" line
   *  under each Zone header. Omit to hide the line entirely (e.g. while data is still loading). */
  zoneBinRanges?: ZoneBinRange[];
  /** Shrinks header padding for panes shorter than ELZ's full-page one (e.g. STG's
   *  bottom-half zone map). Default false keeps ELZ pixel-identical. Row height is no
   *  longer a `dense`-driven fixed value either way — see the Level rows comment below. */
  dense?: boolean;
}

const ZONES = [1, 2, 3, 4] as const;
const SIDES: GridSide[] = ['odd', 'even'];

// Divider styling (v1.6.5 follow-up): every row/column divider between cells uses the
// grid's old zone-divider look (2px, neutral gray) so individual cells read clearly; the
// zone-to-zone boundary itself is bumped 1.5x heavier (3px) and colored to stand out from
// the now-more-visible cell grid around it. The blue reuses `storageCodeColors.ts`'s CR
// slot — already contrast-validated against this grid's dark cell surface via the dataviz
// skill's palette validator, and borders vs. cell text are visually distinct enough that
// reusing the hex doesn't read as a collision.
const CELL_DIVIDER_COLOR = 'border-[#555]';
const ZONE_DIVIDER = 'border-l-[3px] border-[#3987e5]';

/** Builds the lookup key for a grid cell's zone-side position, e.g. "2-odd". */
function cellKey(zone: number, side: GridSide): string {
  return `${zone}-${side}`;
}

/**
 * Visual map of one aisle's physical layout: 8 fixed columns (Zone 1-4 × Odd/Even side)
 * by one row per physical level, Level 1 at the bottom mirroring the real aisle. Each cell
 * shows its {StorageCode}-{Size} designation, the Storage Code colored from a curated
 * per-code palette (`storageCodeColors.ts`) for at-a-glance distinctiveness; contracted
 * zone-side/level groups are highlighted red instead. Read-only for every role — no cell
 * interaction (per ELZ.md). Shared between ELZ (built) and STG (deferred — design session
 * required).
 *
 * The grid always fills its parent's height rather than scrolling (v1.6.5) — each level's
 * row gets a share of that fixed height weighted by `SIZE_WEIGHTS[size]` (a level's Size is
 * constant across every zone/side within it, see `seed.ts`'s `getSize`), so a Large-only
 * aisle's rows are taller than a Half-Small one's, and an aisle with many levels still fits
 * without narrowing thresholds or scrolling.
 */
export function AisleGrid({ levels, zoneBinRanges, dense = false }: AisleGridProps) {
  // Level 1 at bottom, highest level at top.
  const rows = [...levels].sort((a, b) => b.level - a.level);
  const binRangeByZone = new Map((zoneBinRanges ?? []).map((r) => [r.zone, r]));

  return (
    <div className="h-full flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-hidden select-none">
      {/* Header row 1 — zone label + bin range, spanning its Odd+Even column pair */}
      <div className="flex bg-[#161616] border-b border-[#2A2A2A] shrink-0">
        <div className="w-[56px] shrink-0" />
        {ZONES.map((zone) => {
          const range = binRangeByZone.get(zone);
          return (
            <div
              key={zone}
              className={`flex-1 text-center ${ZONE_DIVIDER} first:border-l-0 ${dense ? 'py-0.5' : 'py-1'}`}
            >
              <span className="block font-ui text-[12px] font-bold text-white uppercase tracking-wider">
                Zone {zone}
              </span>
              {range && (
                <span className="block font-data text-[10px] text-[#9A9A9A]">
                  BINS: {range.maxBin} - {range.minBin}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Header row 2 — Odd / Even sub-headers */}
      <div className="flex bg-[#111111] border-b border-[#2A2A2A] shrink-0">
        <div className="w-[56px] shrink-0" />
        {ZONES.map((zone) => (
          <div key={zone} className={`flex-1 flex ${ZONE_DIVIDER} first:border-l-0`}>
            {SIDES.map((side) => (
              <div
                key={cellKey(zone, side)}
                className={`flex-1 text-center border-l-2 ${CELL_DIVIDER_COLOR} first:border-l-0 ${dense ? 'py-1' : 'py-2'}`}
              >
                <span className="font-ui text-[13px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
                  {side === 'odd' ? 'Odd' : 'Even'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Level rows — each weighted by its Size's relative height (SIZE_WEIGHTS), filling
          all remaining space instead of scrolling. */}
      <div className="flex-1 flex flex-col min-h-0">
        {rows.map((row) => {
          const byPos = new Map(row.cells.map((c) => [cellKey(c.zone, c.side), c]));
          // A level's Size is constant across every zone/side within it (see getSize) —
          // the first cell present is as representative as any other.
          const weight = SIZE_WEIGHTS[row.cells[0]?.size ?? 'L'] ?? 1;
          return (
            <div
              key={row.level}
              style={{ flexGrow: weight, flexBasis: 0 }}
              className={`min-h-0 flex border-b-2 ${CELL_DIVIDER_COLOR} last:border-b-0`}
            >
              <div className={`w-[56px] shrink-0 flex items-center justify-center bg-[#0D0D0D] border-r-2 ${CELL_DIVIDER_COLOR}`}>
                <span className="font-data text-[14px] font-semibold text-[#9A9A9A]">
                  {row.level}
                </span>
              </div>
              {ZONES.map((zone) => (
                <div key={zone} className={`flex-1 flex ${ZONE_DIVIDER} first:border-l-0`}>
                  {SIDES.map((side) => {
                    const cell = byPos.get(cellKey(zone, side));
                    return (
                      <div
                        key={cellKey(zone, side)}
                        className={`flex-1 flex items-center justify-center border-l-2 ${CELL_DIVIDER_COLOR} first:border-l-0 ${
                          cell?.contraction ? 'bg-[#4A0000]' : 'bg-[#0A0A0A]'
                        }`}
                      >
                        {cell ? (
                          <span
                            className="font-data text-[13px] font-medium"
                            style={{
                              color: cell.contraction
                                ? '#FF6666'
                                : (STORAGE_CODE_COLORS[cell.storageCode] ?? STORAGE_CODE_COLOR_FALLBACK),
                            }}
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
